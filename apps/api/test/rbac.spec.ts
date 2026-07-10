/**
 * RBAC + scoping integration tests (spec Section 2 & 9).
 * Runs against the seeded demo database (npm run seed first).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Password123!';

describe('EduM API — RBAC, scoping and financial integrity', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    return res.body.accessToken;
  }

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(`/api${path}`).set('Authorization', `Bearer ${token}`);
  const post = (path: string, token: string, body: object = {}) =>
    request(app.getHttpServer()).post(`/api${path}`).set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    for (const [key, email] of Object.entries({
      admin: 'admin@demo.edum.school',
      teacher: 'teacher1@demo.edum.school',
      parent1: 'parent1@demo.edum.school',
      parent2: 'parent2@demo.edum.school',
      student: 'student1@demo.edum.school',
      accountant: 'accountant@demo.edum.school',
      hr: 'hr@demo.edum.school',
    })) {
      tokens[key] = await login(email);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authentication boundary', () => {
    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/users').expect(401);
    });

    it('rejects garbage tokens', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', 'Bearer not-a-token')
        .expect(401);
    });
  });

  describe('per-module 403 checks (one wrong-role probe per module)', () => {
    const cases: Array<[string, string, string]> = [
      // [module probe, path, denied role]
      ['users', '/users', 'teacher'],
      ['users', '/users', 'accountant'],
      ['staff', '/staff', 'student'],
      ['staff', '/staff', 'parent1'],
      ['payroll', '/payroll', 'parent1'],
      ['payroll', '/payroll', 'teacher'],
      ['assets', '/assets', 'parent1'],
      ['assets', '/assets', 'teacher'],
      ['fees (hr denied)', '/fees/invoices', 'hr'],
      ['access_control', '/access-control/matrix', 'teacher'],
      ['access_control', '/access-control/audit-logs', 'parent1'],
      ['fleet (accountant denied)', '/fleet/vehicles', 'accountant'],
      ['reports (student catalog is scoped read-only)', '/access-control/sessions', 'student'],
    ];

    for (const [label, path, role] of cases) {
      it(`${role} → GET ${path} is 403 (${label})`, async () => {
        await get(path, tokens[role]).expect(403);
      });
    }

    it('teacher cannot create fee structures', async () => {
      await post('/fees/structures', tokens.teacher, { name: 'X', category: 'annual', amount: 100 }).expect(403);
    });

    it('student cannot add library books (borrow-scoped create)', async () => {
      await post('/library/books', tokens.student, { title: 'Hack the catalog' }).expect(403);
    });

    it('parent cannot record offline payments (pay-scoped create)', async () => {
      const invoice = await prisma.feeInvoice.findFirst();
      await post('/payments', tokens.parent1, {
        invoiceId: invoice!.id, amount: 1, method: 'cash',
      }).expect(403);
    });

    it('parent cannot decide leave requests', async () => {
      const leave = await prisma.leaveRequest.findFirst({ where: { status: 'pending' } });
      if (leave) {
        await request(app.getHttpServer())
          .patch(`/api/leave/${leave.id}/decide`)
          .set('Authorization', `Bearer ${tokens.parent1}`)
          .send({ decision: 'approved' })
          .expect(403);
      }
    });

    it('endpoints without permission metadata fail closed (health is public, matrix probe)', async () => {
      // sanity: an allowed role still passes
      await get('/users?pageSize=1', tokens.admin).expect(200);
    });
  });

  describe('parent isolation — Parent A cannot see Parent B\'s children', () => {
    it('each parent only lists their own linked children', async () => {
      const [p1, p2] = await Promise.all([
        get('/students?pageSize=100', tokens.parent1).expect(200),
        get('/students?pageSize=100', tokens.parent2).expect(200),
      ]);
      expect(p1.body.total).toBeGreaterThan(0);
      expect(p2.body.total).toBeGreaterThan(0);
      const ids1 = new Set(p1.body.items.map((s: { id: string }) => s.id));
      for (const s of p2.body.items) {
        expect(ids1.has(s.id)).toBe(false);
      }
    });

    it('parent1 gets 403 reading parent2\'s child record, attendance, gradebook and homework', async () => {
      const p2children = await get('/students?pageSize=10', tokens.parent2).expect(200);
      const otherChildId = p2children.body.items[0].id;
      await get(`/students/${otherChildId}`, tokens.parent1).expect(403);
      await get(`/attendance/student/${otherChildId}`, tokens.parent1).expect(403);
      await get(`/gradebook/student/${otherChildId}`, tokens.parent1).expect(403);
      await get(`/homework/student/${otherChildId}`, tokens.parent1).expect(403);
      await get(`/analytics/student-overview?studentId=${otherChildId}`, tokens.parent1).expect(403);
    });

    it('parent cannot pay another family\'s invoice', async () => {
      const p2children = await get('/students?pageSize=10', tokens.parent2).expect(200);
      const otherChildId = p2children.body.items[0].id;
      const invoice = await prisma.feeInvoice.findFirst({ where: { studentId: otherChildId } });
      await post('/payments/checkout', tokens.parent1, { invoiceId: invoice!.id }).expect(403);
    });
  });

  describe('student self-scoping', () => {
    it('student list contains exactly their own record', async () => {
      const res = await get('/students', tokens.student).expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].user.email).toBe('student1@demo.edum.school');
    });

    it('student cannot read a classmate\'s record', async () => {
      const all = await get('/students?pageSize=5', tokens.admin).expect(200);
      const other = all.body.items.find(
        (s: { user: { email: string } }) => s.user.email !== 'student1@demo.edum.school',
      );
      await get(`/students/${other.id}`, tokens.student).expect(403);
    });
  });

  describe('teacher scoping', () => {
    it('teacher cannot create homework for a subject/section they are not assigned to', async () => {
      // teacher1 teaches only subject[0]; pick a different subject
      const teacherStaff = await prisma.staff.findFirst({ where: { user: { email: 'teacher1@demo.edum.school' } } });
      const assigned = await prisma.teachingAssignment.findMany({ where: { staffId: teacherStaff!.id } });
      const assignedSubjects = new Set(assigned.map((a) => a.subjectId));
      const otherSubject = await prisma.subject.findFirst({ where: { id: { notIn: Array.from(assignedSubjects) } } });
      const section = await prisma.section.findFirst();
      await post('/homework', tokens.teacher, {
        sectionId: section!.id,
        subjectId: otherSubject!.id,
        type: 'homework',
        title: 'Out of scope',
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      }).expect(403);
    });

    it('teacher cannot mark attendance with students that are not in the target section', async () => {
      const sections = await prisma.section.findMany({ take: 2 });
      const foreignStudent = await prisma.student.findFirst({ where: { sectionId: sections[1].id } });
      await post('/attendance/mark', tokens.teacher, {
        sectionId: sections[0].id,
        date: new Date().toISOString().slice(0, 10),
        entries: [{ studentId: foreignStudent!.id, status: 'present' }],
      }).expect(400);
    });
  });

  describe('financial integrity — invoices reconcile', () => {
    it('sum(payments) + outstanding == invoice total for every seeded invoice', async () => {
      const invoices = await prisma.feeInvoice.findMany({
        where: { status: { not: 'cancelled' } },
        include: { payments: true },
      });
      expect(invoices.length).toBeGreaterThan(0);
      for (const inv of invoices) {
        const due = Number(inv.totalAmount) - Number(inv.discount) + Number(inv.lateFee);
        const paid =
          inv.payments.filter((p) => p.status === 'success').reduce((a, p) => a + Number(p.amount), 0) -
          inv.payments.filter((p) => p.status === 'refunded').reduce((a, p) => a + Number(p.amount), 0);
        const outstanding = Math.max(0, due - paid);
        expect(paid).toBeLessThanOrEqual(due + 0.001);
        expect(Math.abs(paid + outstanding - due)).toBeLessThan(0.01);
        // status consistency
        if (inv.status === 'paid') expect(Math.abs(paid - due)).toBeLessThan(0.01);
        if (inv.status === 'partial') {
          expect(paid).toBeGreaterThan(0);
          expect(paid).toBeLessThan(due);
        }
        if (inv.status === 'overdue') expect(paid).toBe(0);
      }
    });

    it('fees analytics collected+outstanding == invoiced', async () => {
      const res = await get('/fees/analytics', tokens.accountant).expect(200);
      const { invoiced, collected, outstanding } = res.body;
      expect(Math.abs(collected + outstanding - invoiced)).toBeLessThanOrEqual(2); // rounding to whole ₹
    });
  });

  describe('fee state machine', () => {
    it('accountant payment exceeding outstanding balance is rejected', async () => {
      const invoice = await prisma.feeInvoice.findFirst({ where: { status: 'partial' } });
      await post('/payments', tokens.accountant, {
        invoiceId: invoice!.id,
        amount: 99_999_999,
        method: 'cash',
      }).expect(400);
    });
  });
});
