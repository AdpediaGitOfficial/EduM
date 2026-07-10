/* eslint-disable no-console */
/**
 * EduM demo seed — Section 7 of the build spec.
 * Idempotent: if the demo school already exists with users, it prints
 * credentials and exits. Set FORCE_RESEED=1 to wipe the demo school's data
 * and re-seed from scratch.
 *
 * Run: npm run seed   (from apps/api or repo root)
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PERMISSION_MATRIX } from '../src/common/permissions.matrix';

const prisma = new PrismaClient();

const SCHOOL_CODE = 'DEMO';
const PASSWORD = 'Password123!';

// deterministic RNG so the dataset is stable across machines
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260710);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Sai', 'Ishaan', 'Kabir', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Myra', 'Anika', 'Navya', 'Rohan', 'Dev', 'Krish', 'Riya', 'Tara', 'Zara', 'Ayaan', 'Ved', 'Ira', 'Kiara', 'Reyansh', 'Advait', 'Pari', 'Avni', 'Yuvraj', 'Shaurya', 'Meera', 'Nitya', 'Om', 'Rudra', 'Sia', 'Vanya', 'Arnav', 'Dhruv', 'Ishita', 'Jhanvi'];
const LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Iyer', 'Reddy', 'Nair', 'Gupta', 'Mehta', 'Singh', 'Kapoor', 'Joshi', 'Desai', 'Kulkarni', 'Rao', 'Chopra', 'Malhotra', 'Bose', 'Das', 'Pillai', 'Menon'];

function grade(scorePct: number): string {
  if (scorePct >= 90) return 'A+';
  if (scorePct >= 80) return 'A';
  if (scorePct >= 70) return 'B+';
  if (scorePct >= 60) return 'B';
  if (scorePct >= 50) return 'C';
  if (scorePct >= 40) return 'D';
  return 'F';
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

/** last `count` weekdays (Mon-Fri), oldest first */
function schoolDays(count: number): Date[] {
  const out: Date[] = [];
  let offset = 1;
  while (out.length < count) {
    const d = daysAgo(offset);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(d);
    offset++;
  }
  return out.reverse();
}

async function main() {
  const existing = await prisma.school.findUnique({ where: { code: SCHOOL_CODE } });
  if (existing) {
    const userCount = await prisma.user.count({ where: { schoolId: existing.id } });
    if (userCount > 0 && process.env.FORCE_RESEED !== '1') {
      console.log('Seed: demo school already present — skipping (set FORCE_RESEED=1 to wipe & re-seed).');
      printCredentials();
      return;
    }
    if (process.env.FORCE_RESEED === '1') {
      console.log('FORCE_RESEED=1 — deleting demo school data…');
      // Order matters for RESTRICT FKs (financial records first).
      await prisma.$transaction([
        prisma.payment.deleteMany({ where: { schoolId: existing.id } }),
        prisma.feeInvoiceItem.deleteMany({ where: { invoice: { schoolId: existing.id } } }),
        prisma.feeInvoice.deleteMany({ where: { schoolId: existing.id } }),
        prisma.payroll.deleteMany({ where: { staff: { schoolId: existing.id } } }),
        prisma.libraryTransaction.deleteMany({ where: { book: { schoolId: existing.id } } }),
      ]);
      await prisma.user.deleteMany({ where: { schoolId: existing.id } }); // cascades staff/students/etc.
      await prisma.school.delete({ where: { id: existing.id } });
    }
  }

  console.log('Seeding demo school…');
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const school = await prisma.school.create({
    data: {
      name: 'Sunrise International School',
      code: SCHOOL_CODE,
      address: '12 Lakeview Road, Pune, MH 411001',
      phone: '+91-20-5550-1234',
      email: 'office@demo.edum.school',
      website: 'https://demo.edum.school',
      brandColor: '#2563eb',
      settings: { motto: 'Learn. Grow. Shine.', gradingScale: 'percentage' },
    },
  });
  const schoolId = school.id;

  // ── permissions matrix ──
  await prisma.permission.createMany({
    data: PERMISSION_MATRIX.map((p) => ({
      schoolId,
      role: p.role as any,
      module: p.module,
      action: p.action as any,
      scope: p.scope ?? null,
    })),
    skipDuplicates: true,
  });

  // ── academic year + terms ──
  const year = await prisma.academicYear.create({
    data: {
      schoolId,
      name: '2026-27',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'),
      isActive: true,
      terms: {
        create: [
          { name: 'Term 1', startDate: new Date('2026-04-01'), endDate: new Date('2026-09-30') },
          { name: 'Term 2', startDate: new Date('2026-10-01'), endDate: new Date('2027-03-31') },
        ],
      },
    },
  });

  // ── classes, sections, subjects ──
  const gradeNames = [
    { name: 'Grade 6', level: 6 },
    { name: 'Grade 7', level: 7 },
    { name: 'Grade 8', level: 8 },
  ];
  const classes = [] as { id: string; name: string; level: number }[];
  for (const g of gradeNames) {
    classes.push(await prisma.class.create({ data: { schoolId, ...g } }));
  }

  const subjectDefs = [
    ['English', 'ENG'], ['Mathematics', 'MAT'], ['Science', 'SCI'], ['Social Studies', 'SST'],
    ['Hindi', 'HIN'], ['Computer Science', 'CS'], ['Art & Music', 'ART'], ['Physical Education', 'PE'],
  ];
  const subjects = [] as { id: string; name: string; code: string }[];
  for (const [name, code] of subjectDefs) {
    subjects.push(await prisma.subject.create({ data: { schoolId, name, code } }));
  }

  // ── core role users ──
  async function createUser(role: string, first: string, last: string, email: string, phone?: string) {
    return prisma.user.create({
      data: {
        schoolId,
        email,
        passwordHash,
        role: role as any,
        firstName: first,
        lastName: last,
        phone: phone ?? `+91-98${randInt(10000000, 99999999)}`,
        status: 'active',
      },
    });
  }

  const superAdmin = await createUser('super_admin', 'Sam', 'Root', 'superadmin@demo.edum.school');
  const admin = await createUser('school_admin', 'Asha', 'Kulkarni', 'admin@demo.edum.school');
  const principalU = await createUser('principal', 'Prakash', 'Iyer', 'principal@demo.edum.school');
  const vicePrincipalU = await createUser('vice_principal', 'Vidya', 'Nair', 'vice.principal@demo.edum.school');
  const hrU = await createUser('hr', 'Harsha', 'Rao', 'hr@demo.edum.school');
  const accountantU = await createUser('accountant', 'Anil', 'Gupta', 'accountant@demo.edum.school');

  // staff rows for non-teaching leadership/ops roles
  const staffFor = async (u: { id: string }, employeeNo: string, dept: string, desig: string, salary: number) =>
    prisma.staff.create({
      data: {
        schoolId, userId: u.id, employeeNo, department: dept, designation: desig,
        qualifications: 'M.A., B.Ed.', joinDate: new Date('2020-06-01'), baseSalary: salary,
      },
    });
  const principalStaff = await staffFor(principalU, 'EMP-001', 'Administration', 'Principal', 120000);
  const vpStaff = await staffFor(vicePrincipalU, 'EMP-002', 'Administration', 'Vice Principal', 100000);
  const hrStaff = await staffFor(hrU, 'EMP-003', 'Human Resources', 'HR Manager', 80000);
  const acctStaff = await staffFor(accountantU, 'EMP-004', 'Finance', 'Accountant', 75000);

  // ── 8 teachers, one per subject ──
  const teacherUsers = [] as { id: string }[];
  const teacherStaff = [] as { id: string; userId: string }[];
  for (let i = 0; i < 8; i++) {
    const first = FIRST_NAMES[i + 10];
    const last = LAST_NAMES[i];
    const u = await createUser('teacher', first, last, `teacher${i + 1}@demo.edum.school`);
    teacherUsers.push(u);
    const st = await prisma.staff.create({
      data: {
        schoolId, userId: u.id, employeeNo: `EMP-1${String(i + 1).padStart(2, '0')}`,
        department: ['Languages', 'Mathematics', 'Science', 'Humanities'][i % 4],
        designation: 'Teacher', qualifications: 'B.Sc., B.Ed.',
        joinDate: new Date(`202${randInt(0, 4)}-06-15`), baseSalary: 45000 + i * 2500,
      },
    });
    teacherStaff.push(st);
  }

  // ── sections: 3 grades × 2 ──
  const sections = [] as { id: string; classId: string; name: string; className: string; level: number }[];
  let secIdx = 0;
  for (const c of classes) {
    for (const name of ['A', 'B']) {
      const s = await prisma.section.create({
        data: {
          classId: c.id, name, room: `R-${c.level}0${name === 'A' ? 1 : 2}`,
          classTeacherId: teacherStaff[secIdx % teacherStaff.length].id, capacity: 30,
        },
      });
      sections.push({ id: s.id, classId: c.id, name, className: c.name, level: c.level });
      secIdx++;
    }
  }

  // ── teaching assignments: teacher i teaches subject i in every section ──
  for (let i = 0; i < 8; i++) {
    for (const sec of sections) {
      await prisma.teachingAssignment.create({
        data: { staffId: teacherStaff[i].id, sectionId: sec.id, subjectId: subjects[i].id },
      });
    }
  }

  // ── timetable: Mon-Fri, 8 periods/day per section ──
  const periodTimes = [
    ['08:00', '08:45'], ['08:45', '09:30'], ['09:30', '10:15'], ['10:35', '11:20'],
    ['11:20', '12:05'], ['12:50', '13:35'], ['13:35', '14:20'], ['14:20', '15:05'],
  ];
  for (const sec of sections) {
    for (let day = 1; day <= 5; day++) {
      for (let p = 0; p < 8; p++) {
        const subjIdx = (day + p + sections.indexOf(sec as any)) % 8;
        await prisma.timetableSlot.create({
          data: {
            sectionId: sec.id, subjectId: subjects[subjIdx].id,
            teacherStaffId: teacherStaff[subjIdx].id,
            dayOfWeek: day, periodNo: p + 1,
            startTime: periodTimes[p][0], endTime: periodTimes[p][1],
            room: `R-${sec.level}0${sec.name === 'A' ? 1 : 2}`,
          },
        });
      }
    }
  }

  // ── transport: 3 buses, routes, stops ──
  const vehicles = [] as { id: string }[];
  const allStops = [] as { id: string; routeId: string }[];
  const routeNames = ['North Loop', 'South Loop', 'East Loop'];
  for (let v = 0; v < 3; v++) {
    const veh = await prisma.vehicle.create({
      data: {
        schoolId, registration: `MH12-SB-${1001 + v}`, model: 'Tata Starbus 40',
        capacity: 40, driverName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        driverPhone: `+91-97${randInt(10000000, 99999999)}`, status: 'active',
        gpsDeviceId: `GPS-${2000 + v}`,
      },
    });
    vehicles.push(veh);
    const route = await prisma.transportRoute.create({
      data: { schoolId, vehicleId: veh.id, name: routeNames[v], monthlyFee: 1500 },
    });
    for (let s = 0; s < 4; s++) {
      const stop = await prisma.routeStop.create({
        data: {
          routeId: route.id, name: `${routeNames[v]} Stop ${s + 1}`, sequence: s + 1,
          pickupTime: `07:${String(10 + s * 10).padStart(2, '0')}`,
          dropTime: `15:${String(30 + s * 5).padStart(2, '0')}`,
          lat: 18.52 + rand() * 0.1, lng: 73.85 + rand() * 0.1,
        },
      });
      allStops.push({ id: stop.id, routeId: route.id });
    }
    await prisma.vehicleMaintenance.create({
      data: { vehicleId: veh.id, type: 'service', date: daysAgo(randInt(10, 60)), cost: randInt(3000, 9000), notes: 'Routine service' },
    });
    await prisma.fuelLog.create({
      data: { vehicleId: veh.id, date: daysAgo(randInt(1, 20)), liters: randInt(30, 60), cost: randInt(2800, 5800), odometer: randInt(40000, 90000) },
    });
  }

  // ── students + parents + guardians ──
  const students = [] as { id: string; userId: string; sectionId: string; classId: string; level: number; name: string }[];
  const parents = [] as { id: string }[];
  for (let i = 0; i < 40; i++) {
    const first = FIRST_NAMES[i];
    const last = LAST_NAMES[i % LAST_NAMES.length];
    const sec = sections[i % 6];
    const useTransport = i % 3 === 0; // ~13 students on transport
    const stop = useTransport ? pick(allStops) : null;
    const u = await createUser('student', first, last, `student${i + 1}@demo.edum.school`);
    const st = await prisma.student.create({
      data: {
        schoolId, userId: u.id, admissionNo: `ADM-2026-${String(i + 1).padStart(3, '0')}`,
        sectionId: sec.id, rollNo: Math.floor(i / 6) + 1,
        dob: new Date(2013 - (sec.level - 6), randInt(0, 11), randInt(1, 28)),
        gender: i % 2 === 0 ? 'male' : 'female',
        bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O-']),
        address: `${randInt(1, 200)} ${pick(['MG Road', 'FC Road', 'Baner Road', 'Aundh'])}, Pune`,
        admissionDate: new Date('2026-04-01'),
        status: 'active',
        transportRouteStopId: stop?.id ?? null,
      },
    });
    students.push({ id: st.id, userId: u.id, sectionId: sec.id, classId: sec.classId, level: sec.level, name: `${first} ${last}` });

    await prisma.studentMedical.create({
      data: {
        studentId: st.id,
        allergies: i % 7 === 0 ? 'Peanuts' : null,
        conditions: i % 11 === 0 ? 'Mild asthma' : null,
        emergencyName: `${pick(FIRST_NAMES)} ${last}`,
        emergencyPhone: `+91-96${randInt(10000000, 99999999)}`,
      },
    });
  }

  // 40 parents; students 36-39 are siblings of students 0-3 (share parent),
  // parents 36-39 become secondary guardians of students 0-3.
  for (let i = 0; i < 40; i++) {
    const p = await createUser('parent', pick(FIRST_NAMES), LAST_NAMES[i % LAST_NAMES.length], `parent${i + 1}@demo.edum.school`);
    parents.push(p);
  }
  for (let i = 0; i < 36; i++) {
    await prisma.guardian.create({
      data: { studentId: students[i].id, userId: parents[i].id, relation: i % 2 === 0 ? 'father' : 'mother', isPrimary: true },
    });
  }
  for (let k = 0; k < 4; k++) {
    // sibling shares parent k
    await prisma.guardian.create({
      data: { studentId: students[36 + k].id, userId: parents[k].id, relation: 'father', isPrimary: true },
    });
    // extra parent account as secondary guardian of student k
    await prisma.guardian.create({
      data: { studentId: students[k].id, userId: parents[36 + k].id, relation: 'mother', isPrimary: false },
    });
  }

  // ── attendance: 60 school days, ~90% present ──
  const days = schoolDays(60);
  const attendanceRows: Prisma.AttendanceRecordCreateManyInput[] = [];
  for (const s of students) {
    for (const d of days) {
      const r = rand();
      const status = r < 0.9 ? 'present' : r < 0.94 ? 'late' : r < 0.97 ? 'leave' : 'absent';
      attendanceRows.push({
        schoolId, studentId: s.id, sectionId: s.sectionId, date: d,
        status: status as any, source: 'manual',
      });
    }
  }
  await prisma.attendanceRecord.createMany({ data: attendanceRows });

  // staff attendance for the last 30 school days
  const staffAll = [principalStaff, vpStaff, hrStaff, acctStaff, ...teacherStaff];
  const staffAttRows: Prisma.StaffAttendanceCreateManyInput[] = [];
  for (const st of staffAll) {
    for (const d of days.slice(-30)) {
      const r = rand();
      staffAttRows.push({
        staffId: st.id, date: d,
        status: (r < 0.93 ? 'present' : r < 0.97 ? 'leave' : 'absent') as any,
      });
    }
  }
  await prisma.staffAttendance.createMany({ data: staffAttRows });

  // ── homework: 15 per section, mixed submissions ──
  const hwTitles = ['Chapter exercises', 'Worksheet', 'Essay draft', 'Lab report', 'Reading log', 'Problem set', 'Project milestone', 'Revision quiz prep', 'Map work', 'Presentation outline', 'Grammar practice', 'Diagram labelling', 'Case study', 'Field notes', 'Practice test'];
  for (const sec of sections) {
    for (let h = 0; h < 15; h++) {
      const subjIdx = h % 8;
      const assignedDaysAgo = randInt(3, 55);
      const dueOffset = randInt(2, 7);
      const due = daysAgo(assignedDaysAgo - dueOffset);
      const hw = await prisma.homework.create({
        data: {
          schoolId, sectionId: sec.id, subjectId: subjects[subjIdx].id,
          teacherStaffId: teacherStaff[subjIdx].id,
          type: h % 5 === 4 ? 'project' : h % 3 === 2 ? 'assignment' : 'homework',
          title: `${subjects[subjIdx].name}: ${hwTitles[h]}`,
          description: `Complete ${hwTitles[h].toLowerCase()} for ${subjects[subjIdx].name}.`,
          assignedAt: daysAgo(assignedDaysAgo), dueDate: due, maxScore: 10,
        },
      });
      const secStudents = students.filter((s) => s.sectionId === sec.id);
      for (const s of secStudents) {
        const r = rand();
        const isPast = due < new Date();
        let status: string; let submittedAt: Date | null = null; let score: number | null = null;
        if (!isPast) {
          status = r < 0.4 ? 'submitted' : 'pending';
          if (status === 'submitted') submittedAt = new Date();
        } else if (r < 0.7) {
          status = 'graded'; submittedAt = new Date(due.getTime() - 86400000); score = randInt(5, 10);
        } else if (r < 0.85) {
          status = 'late'; submittedAt = new Date(due.getTime() + 86400000 * randInt(1, 3)); score = randInt(4, 8);
        } else if (r < 0.93) {
          status = 'submitted'; submittedAt = new Date(due.getTime() - 86400000);
        } else {
          status = 'missed';
        }
        await prisma.homeworkSubmission.create({
          data: {
            homeworkId: hw.id, studentId: s.id, status: status as any,
            submittedAt, score, content: submittedAt ? 'Submitted work (text answer).' : null,
            feedback: score != null ? pick(['Good work', 'Well done', 'Needs more detail', 'Excellent', 'Check step 3']) : null,
          },
        });
      }
    }
  }

  // ── exams: 2 internal, results for all students × all subjects ──
  const examDefs = [
    { name: 'Unit Test 1', start: daysAgo(50), end: daysAgo(45) },
    { name: 'Mid-Term Examination', start: daysAgo(25), end: daysAgo(18) },
  ];
  const exams = [] as { id: string; name: string }[];
  for (const e of examDefs) {
    const exam = await prisma.exam.create({
      data: {
        schoolId, academicYearId: year.id, name: e.name, type: 'internal',
        startDate: e.start, endDate: e.end, published: true,
      },
    });
    exams.push(exam);
    for (const c of classes) {
      for (const [si, subj] of subjects.entries()) {
        const es = await prisma.examSubject.create({
          data: { examId: exam.id, subjectId: subj.id, classId: c.id, maxScore: 100, examDate: new Date(e.start.getTime() + si * 86400000 * 0.7) },
        });
        if (si < 2) {
          await prisma.rubric.createMany({
            data: [
              { assessmentId: es.id, criteria: 'Concept understanding', maxScore: 40 },
              { assessmentId: es.id, criteria: 'Problem solving / application', maxScore: 40 },
              { assessmentId: es.id, criteria: 'Presentation & accuracy', maxScore: 20 },
            ],
          });
        }
      }
    }
    // results — per-student ability bias for realistic distribution
    const resultRows: Prisma.ExamResultCreateManyInput[] = [];
    for (const s of students) {
      const ability = 0.45 + rand() * 0.5; // 45%..95% baseline
      for (const subj of subjects) {
        const noise = (rand() - 0.5) * 0.24;
        const pct = Math.max(20, Math.min(99, Math.round((ability + noise) * 100)));
        resultRows.push({
          examId: exam.id, studentId: s.id, subjectId: subj.id,
          score: pct, maxScore: 100, grade: grade(pct),
        });
      }
    }
    await prisma.examResult.createMany({ data: resultRows });
  }

  // ── fees: structure per grade + transport; invoices for all students ──
  const feeStructures = new Map<string, { id: string; amount: number }>();
  for (const c of classes) {
    const annual = await prisma.feeStructure.create({
      data: {
        schoolId, classId: c.id, name: `${c.name} Annual Tuition`, category: 'annual',
        amount: 42000 + (c.level - 6) * 3000, academicYearName: year.name,
      },
    });
    feeStructures.set(c.id, { id: annual.id, amount: 42000 + (c.level - 6) * 3000 });
  }
  const transportFee = await prisma.feeStructure.create({
    data: { schoolId, name: 'Transport (Annual)', category: 'transport', amount: 15000, academicYearName: year.name },
  });

  let invoiceCounter = 1;
  let receiptCounter = 1;
  for (const [i, s] of students.entries()) {
    const tuition = feeStructures.get(s.classId)!;
    const onTransport = i % 3 === 0;
    const total = tuition.amount + (onTransport ? 15000 : 0);
    const bucket = rand();
    // 70% paid / 20% partial / 10% overdue
    const state = bucket < 0.7 ? 'paid' : bucket < 0.9 ? 'partial' : 'overdue';
    const dueDate = state === 'overdue' ? daysAgo(randInt(5, 30)) : daysAgo(-30);
    const invoice = await prisma.feeInvoice.create({
      data: {
        schoolId, studentId: s.id,
        invoiceNo: `INV-2026-${String(invoiceCounter++).padStart(4, '0')}`,
        status: state === 'paid' ? 'paid' : state === 'partial' ? 'partial' : 'overdue',
        issueDate: daysAgo(55), dueDate, totalAmount: total,
        items: {
          create: [
            { feeStructureId: tuition.id, description: 'Annual tuition', amount: tuition.amount },
            ...(onTransport ? [{ feeStructureId: transportFee.id, description: 'Transport (annual)', amount: 15000 }] : []),
          ],
        },
      },
    });
    if (state === 'paid') {
      await prisma.payment.create({
        data: {
          schoolId, invoiceId: invoice.id, receiptNo: `RCP-2026-${String(receiptCounter++).padStart(4, '0')}`,
          amount: total, method: pick(['upi', 'card', 'bank_transfer', 'cash']) as any,
          status: 'success', paidAt: daysAgo(randInt(10, 50)), collectedById: accountantU.id,
        },
      });
    } else if (state === 'partial') {
      const part = Math.round(total * pick([0.25, 0.4, 0.5, 0.6]));
      await prisma.payment.create({
        data: {
          schoolId, invoiceId: invoice.id, receiptNo: `RCP-2026-${String(receiptCounter++).padStart(4, '0')}`,
          amount: part, method: pick(['upi', 'cash']) as any,
          status: 'success', paidAt: daysAgo(randInt(5, 40)), collectedById: accountantU.id,
        },
      });
    }
  }

  // ── payroll: 10 records ──
  const months = ['2026-04', '2026-05', '2026-06'];
  let payrollCount = 0;
  outer: for (const m of months) {
    for (const st of staffAll) {
      if (payrollCount >= 10) break outer;
      const base = Number((await prisma.staff.findUniqueOrThrow({ where: { id: st.id } })).baseSalary);
      const deductions = Math.round(base * 0.08);
      await prisma.payroll.create({
        data: {
          staffId: st.id, month: m, baseSalary: base, allowances: Math.round(base * 0.1),
          deductions, netSalary: base + Math.round(base * 0.1) - deductions,
          status: m === '2026-06' ? 'processed' : 'paid',
          paidAt: m === '2026-06' ? null : new Date(`${m}-28`),
        },
      });
      payrollCount++;
    }
  }

  // ── leave requests: 5 ──
  const leaveDefs = [
    { staff: teacherStaff[0], type: 'sick', status: 'approved', s: 12, e: 10 },
    { staff: teacherStaff[1], type: 'casual', status: 'pending', s: -3, e: -4 },
    { staff: teacherStaff[2], type: 'earned', status: 'rejected', s: 20, e: 15 },
    { staff: teacherStaff[3], type: 'casual', status: 'approved', s: 6, e: 5 },
    { staff: hrStaff, type: 'sick', status: 'pending', s: -1, e: -2 },
  ];
  for (const l of leaveDefs) {
    await prisma.leaveRequest.create({
      data: {
        staffId: l.staff.id, type: l.type as any, startDate: daysAgo(l.s), endDate: daysAgo(l.e),
        reason: pick(['Family function', 'Medical', 'Personal work', 'Travel']),
        status: l.status as any,
        approvedById: l.status !== 'pending' ? principalStaff.id : null,
        decidedAt: l.status !== 'pending' ? daysAgo(Math.max(0, l.s - 1)) : null,
      },
    });
  }

  // ── staff performance + tasks ──
  for (const [i, st] of teacherStaff.entries()) {
    await prisma.staffPerformance.create({
      data: {
        staffId: st.id, reviewPeriod: '2026-T1', rating: randInt(3, 5),
        notes: pick(['Consistently strong classroom engagement.', 'Good results; improve homework turnaround.', 'Excellent mentoring of weak students.']),
        reviewedById: principalStaff.id,
      },
    });
    if (i < 4) {
      await prisma.staffTask.create({
        data: {
          staffId: st.id, title: pick(['Prepare mid-term analysis', 'Update lesson plans', 'Lab inventory check', 'Parent meeting follow-ups']),
          dueDate: daysAgo(-randInt(2, 10)), status: pick(['todo', 'in_progress', 'done']) as any,
        },
      });
    }
  }

  // ── announcements: 10 mixed targeting ──
  const annDefs: Array<[string, string, string, any]> = [
    ['Annual Sports Day', 'Annual sports day will be held on the last Friday of this month. All students must register with their PE teacher.', 'school', {}],
    ['Fee payment reminder', 'Q2 installments are due by the 15th. Please clear outstanding dues to avoid late fees.', 'role', { targetRole: 'parent' }],
    ['Staff meeting', 'All teaching staff: monthly review meeting on Monday 3:30 PM in the conference hall.', 'role', { targetRole: 'teacher' }],
    ['Grade 6A field trip', 'Grade 6-A visits the science park on Thursday. Consent forms due Tuesday.', 'class_section', { targetSectionId: sections[0].id }],
    ['Library week', 'Reading challenge all week — borrow 3 books, earn a certificate!', 'school', {}],
    ['Mid-term results published', 'Mid-term examination results are now visible in the gradebook.', 'school', {}],
    ['Bus route change', 'North Loop pickup times shift 10 minutes earlier from next week.', 'school', {}],
    ['PTA meeting', 'Parent-teacher meetings scheduled for Saturday, slots bookable via class teacher.', 'role', { targetRole: 'parent' }],
    ['Science exhibition', 'Grade 8 science exhibition entries close Friday.', 'class_section', { targetSectionId: sections[4].id }],
    ['Congratulations!', 'You have been selected for the inter-school math olympiad team.', 'individual', { targetUserId: students[2].userId }],
  ];
  for (const [i, [title, body, audience, extra]] of annDefs.entries()) {
    await prisma.announcement.create({
      data: {
        schoolId, authorId: i % 2 === 0 ? admin.id : principalU.id, title, body,
        audience: audience as any, pinned: i === 0, publishedAt: daysAgo(randInt(0, 20)), ...extra,
      },
    });
  }

  // ── complaints: 8 in various states ──
  const complaintDefs = [
    { by: parents[1].id, cat: 'transport', subj: 'Bus frequently late', st: 'open', pr: 'high' },
    { by: parents[3].id, cat: 'academic', subj: 'Homework load too high', st: 'in_review', pr: 'medium' },
    { by: parents[5].id, cat: 'fees', subj: 'Duplicate late fee charged', st: 'resolved', pr: 'medium' },
    { by: teacherUsers[2].id, cat: 'facility', subj: 'Projector not working in R-702', st: 'resolved', pr: 'low' },
    { by: parents[8].id, cat: 'staff', subj: 'Unable to reach class teacher', st: 'in_review', pr: 'medium' },
    { by: parents[10].id, cat: 'facility', subj: 'Water cooler on 2nd floor broken', st: 'open', pr: 'low' },
    { by: teacherUsers[5].id, cat: 'other', subj: 'Staff room AC faulty', st: 'escalated', pr: 'medium' },
    { by: parents[12].id, cat: 'transport', subj: 'Request stop closer to society gate', st: 'closed', pr: 'low' },
  ];
  for (const c of complaintDefs) {
    await prisma.complaint.create({
      data: {
        schoolId, raisedById: c.by, assignedToId: c.st === 'open' ? null : admin.id,
        category: c.cat, subject: c.subj,
        description: `${c.subj}. Raised via portal — please investigate and update.`,
        status: c.st as any, priority: c.pr as any,
        resolution: c.st === 'resolved' || c.st === 'closed' ? 'Issue addressed and verified with the complainant.' : null,
        escalatedAt: c.st === 'escalated' ? daysAgo(2) : null,
        resolvedAt: c.st === 'resolved' || c.st === 'closed' ? daysAgo(randInt(1, 5)) : null,
        createdAt: daysAgo(randInt(3, 25)),
      },
    });
  }

  // ── assets: 20 ──
  const assetDefs: Array<[string, string, number]> = [
    ['Interactive whiteboard', 'electronics', 85000], ['Projector Epson X49', 'electronics', 42000],
    ['Chemistry lab kit', 'lab', 30000], ['Physics lab kit', 'lab', 32000],
    ['Football set', 'sports', 8000], ['Cricket kit', 'sports', 15000],
    ['Teacher desk', 'furniture', 7000], ['Student bench (pair)', 'furniture', 4500],
    ['Library shelving unit', 'furniture', 12000], ['Desktop PC Lab-01', 'electronics', 38000],
    ['Desktop PC Lab-02', 'electronics', 38000], ['Printer/scanner office', 'electronics', 22000],
    ['Water purifier L2', 'other', 18000], ['Generator 15kVA', 'other', 160000],
    ['Basketball hoop', 'sports', 9500], ['Biology models set', 'lab', 21000],
    ['Music keyboard', 'other', 26000], ['Auditorium speakers', 'electronics', 54000],
    ['CCTV DVR unit', 'electronics', 31000], ['School van (utility)', 'vehicle', 450000],
  ];
  for (const [i, [name, cat, cost]] of assetDefs.entries()) {
    const status = i % 7 === 3 ? 'maintenance' : i % 5 === 4 ? 'available' : 'in_use';
    const asset = await prisma.asset.create({
      data: {
        schoolId, name, category: cat, assetTag: `AST-${String(i + 1).padStart(4, '0')}`,
        purchaseDate: new Date(`202${randInt(1, 5)}-0${randInt(1, 9)}-15`), purchaseCost: cost,
        depreciationRate: cat === 'electronics' ? 20 : cat === 'vehicle' ? 15 : 10,
        vendor: pick(['EduSupplies Co', 'TechServe Pvt Ltd', 'ClassMart', 'LabWorld']),
        amcExpiry: i % 4 === 0 ? daysAgo(-randInt(30, 300)) : null,
        status: status as any,
        allocatedTo: status === 'in_use' ? pick(['R-601', 'R-702', 'R-801', 'Library', 'Office', 'Lab-1']) : null,
        nextMaintenanceAt: i % 3 === 0 ? daysAgo(-randInt(10, 90)) : null,
      },
    });
    if (status === 'maintenance') {
      await prisma.assetMaintenance.create({
        data: { assetId: asset.id, date: daysAgo(randInt(1, 10)), type: 'repair', cost: randInt(500, 5000), notes: 'Under repair' },
      });
    }
  }

  // ── library: 30 books, 10 active borrows ──
  const bookDefs: Array<[string, string, string]> = [
    ['The Jungle Book', 'Rudyard Kipling', 'Fiction'], ['Matilda', 'Roald Dahl', 'Fiction'],
    ['Harry Potter and the Philosopher\'s Stone', 'J.K. Rowling', 'Fiction'], ['Charlotte\'s Web', 'E.B. White', 'Fiction'],
    ['Wings of Fire', 'A.P.J. Abdul Kalam', 'Biography'], ['The Diary of a Young Girl', 'Anne Frank', 'Biography'],
    ['A Brief History of Time', 'Stephen Hawking', 'Science'], ['Cosmos', 'Carl Sagan', 'Science'],
    ['Mathematics Can Be Fun', 'Yakov Perelman', 'Mathematics'], ['The Number Devil', 'H.M. Enzensberger', 'Mathematics'],
    ['Grammar in Use', 'Raymond Murphy', 'Reference'], ['Oxford Student Atlas', 'Oxford', 'Reference'],
    ['Panchatantra Tales', 'Vishnu Sharma', 'Fiction'], ['Malgudi Days', 'R.K. Narayan', 'Fiction'],
    ['The Blue Umbrella', 'Ruskin Bond', 'Fiction'], ['Swami and Friends', 'R.K. Narayan', 'Fiction'],
    ['India: A History', 'John Keay', 'History'], ['Discovery of India', 'Jawaharlal Nehru', 'History'],
    ['Amazing Science Experiments', 'Various', 'Science'], ['Robotics for Kids', 'Various', 'Technology'],
    ['Scratch Programming', 'Various', 'Technology'], ['Python for Young Coders', 'Various', 'Technology'],
    ['World Geography Facts', 'Various', 'Reference'], ['The Art Book for Children', 'Phaidon', 'Art'],
    ['Famous Five: Five on a Treasure Island', 'Enid Blyton', 'Fiction'], ['Secret Seven', 'Enid Blyton', 'Fiction'],
    ['Moral Stories Collection', 'Various', 'Fiction'], ['Sports Rules Handbook', 'Various', 'Sports'],
    ['First Aid Basics', 'Red Cross', 'Health'], ['Environmental Studies Digital Pack', 'Various', 'Science'],
  ];
  const books = [] as { id: string }[];
  for (const [i, [title, author, category]] of bookDefs.entries()) {
    const copies = randInt(2, 5);
    const b = await prisma.libraryBook.create({
      data: {
        schoolId, title, author, category, copies, availableCopies: copies,
        isbn: `978-93-${randInt(10000, 99999)}-${randInt(10, 99)}-${randInt(0, 9)}`,
        shelf: `${pick(['A', 'B', 'C', 'D'])}-${randInt(1, 12)}`,
        isDigital: i === 29,
      },
    });
    books.push(b);
  }
  for (let i = 0; i < 10; i++) {
    const book = books[i * 2];
    const student = students[i * 3];
    const overdue = i % 4 === 0;
    await prisma.libraryTransaction.create({
      data: {
        bookId: book.id, studentId: student.id, type: 'borrow',
        issuedAt: daysAgo(overdue ? 25 : randInt(2, 10)),
        dueAt: daysAgo(overdue ? 11 : -randInt(4, 12)),
        fine: overdue ? 11 * 5 : 0, // ₹5/day fine for demo
      },
    });
    await prisma.libraryBook.update({
      where: { id: book.id },
      data: { availableCopies: { decrement: 1 } },
    });
  }

  // ── behavior + progress notes ──
  for (const s of students) {
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) {
      const positive = rand() < 0.65;
      await prisma.behaviorNote.create({
        data: {
          studentId: s.id,
          teacherId: pick(teacherStaff).id,
          category: positive ? 'positive' : 'negative',
          description: positive
            ? pick(['Helped a classmate during lab work.', 'Excellent participation in class discussion.', 'Showed leadership during group project.', 'Consistently punctual and prepared.'])
            : pick(['Disrupted class during lesson.', 'Homework repeatedly incomplete.', 'Late to class twice this week.']),
          createdAt: daysAgo(randInt(1, 50)),
        },
      });
    }
    await prisma.progressNote.create({
      data: {
        studentId: s.id, authorId: pick(teacherUsers).id,
        note: pick([
          'Showing steady improvement in problem-solving; continue practice worksheets.',
          'Strong conceptual grasp; should attempt olympiad-level questions.',
          'Needs support with written expression — recommended extra reading.',
          'Participation has improved noticeably this term.',
        ]),
        createdAt: daysAgo(randInt(1, 40)),
      },
    });
  }

  // ── notifications (in-app samples) ──
  const notifTargets = [admin, principalU, teacherUsers[0], parents[0], students[0] ? { id: students[0].userId } : admin];
  for (const t of notifTargets) {
    await prisma.notification.createMany({
      data: [
        { userId: t.id, channel: 'in_app', title: 'Welcome to EduM', body: 'Your school workspace is ready. Explore your dashboard.', sentAt: new Date() },
        { userId: t.id, channel: 'in_app', title: 'Mid-term results published', body: 'Mid-term examination results are now available.', sentAt: new Date() },
      ],
    });
  }

  // a couple of demo chat messages
  await prisma.message.createMany({
    data: [
      { senderId: parents[0].id, recipientId: teacherUsers[0].id, body: 'Hello, could we discuss Aarav\'s math progress this week?' },
      { senderId: teacherUsers[0].id, recipientId: parents[0].id, body: 'Of course — Thursday after 3 PM works. He has improved steadily.' },
      { senderId: students[0] ? students[0].userId : parents[0].id, recipientId: teacherUsers[1].id, body: 'Ma\'am, I was absent yesterday. What homework did I miss?' },
    ],
  });

  // certificates for a couple of students
  await prisma.certificate.createMany({
    data: [
      { studentId: students[2].id, type: 'achievement', serialNo: 'CERT-2026-001', data: { event: 'Math Olympiad — School Round', position: 1 } },
      { studentId: students[7].id, type: 'bonafide', serialNo: 'CERT-2026-002', data: { purpose: 'Passport application' } },
    ],
  });

  console.log('Seed complete.');
  printCredentials();
}

function printCredentials() {
  console.log('\n──────────────────────────────────────────────');
  console.log('Demo login credentials (password for ALL users):');
  console.log(`  Password: ${PASSWORD}`);
  console.log('  super_admin    superadmin@demo.edum.school');
  console.log('  school_admin   admin@demo.edum.school');
  console.log('  principal      principal@demo.edum.school');
  console.log('  vice_principal vice.principal@demo.edum.school');
  console.log('  hr             hr@demo.edum.school');
  console.log('  accountant     accountant@demo.edum.school');
  console.log('  teacher        teacher1@demo.edum.school   (…teacher8@)');
  console.log('  parent         parent1@demo.edum.school    (…parent40@)');
  console.log('  student        student1@demo.edum.school   (…student40@)');
  console.log('──────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
