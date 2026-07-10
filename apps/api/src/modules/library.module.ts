import {
  BadRequestException,
  Body, Controller, Delete, ForbiddenException, Get, Injectable, Module,
  NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { ScopeService } from '../common/scope.service';
import { pageArgs, paged, PageQuery } from '../common/pagination';

const FINE_PER_DAY = 5; // ₹ per day overdue
const BORROW_DAYS = 14;

class BookDto {
  @IsString() title!: string;
  @IsOptional() @IsString() author?: string;
  @IsOptional() @IsString() isbn?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() @Min(1) copies?: number;
  @IsOptional() @IsString() shelf?: string;
  @IsOptional() @IsBoolean() isDigital?: boolean;
}

class BorrowDto {
  @IsString() bookId!: string;
  @IsOptional() @IsString() studentId?: string;
}

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async listBooks(user: AuthUser, q: PageQuery & { category?: string; available?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = {
      schoolId: user.schoolId,
      ...(q.category ? { category: q.category } : {}),
      ...(q.available === 'true' ? { availableCopies: { gt: 0 } } : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' as const } },
              { author: { contains: q.search, mode: 'insensitive' as const } },
              { isbn: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.libraryBook.findMany({ where, skip, take, orderBy: { title: 'asc' } }),
      this.prisma.libraryBook.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async createBook(user: AuthUser, dto: BookDto) {
    // students hold a 'borrow'-scoped create permission — catalog writes are staff-only
    if (user.permissionScope === 'borrow') {
      throw new ForbiddenException('Your library access is limited to borrowing');
    }
    const copies = dto.copies ?? 1;
    const b = await this.prisma.libraryBook.create({
      data: { schoolId: user.schoolId, ...dto, copies, availableCopies: copies },
    });
    await this.audit.log(user, 'library', 'book.create', b.id, { title: b.title });
    return b;
  }

  async updateBook(user: AuthUser, id: string, dto: Partial<BookDto>) {
    const b = await this.prisma.libraryBook.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!b) throw new NotFoundException('Book not found');
    let availableAdjust = 0;
    if (dto.copies !== undefined) availableAdjust = dto.copies - b.copies;
    return this.prisma.libraryBook.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.copies !== undefined
          ? { copies: dto.copies, availableCopies: Math.max(0, b.availableCopies + availableAdjust) }
          : {}),
      },
    });
  }

  async deleteBook(user: AuthUser, id: string) {
    const b = await this.prisma.libraryBook.findFirst({ where: { id, schoolId: user.schoolId } });
    if (!b) throw new NotFoundException('Book not found');
    const active = await this.prisma.libraryTransaction.count({
      where: { bookId: id, type: 'borrow', returnedAt: null },
    });
    if (active > 0) throw new BadRequestException('Book has active borrows');
    await this.prisma.libraryTransaction.deleteMany({ where: { bookId: id } });
    await this.prisma.libraryBook.delete({ where: { id } });
    return { ok: true };
  }

  private async resolveBorrowerStudent(user: AuthUser, studentId?: string): Promise<string | null> {
    if (user.role === 'student') {
      // students may only borrow for themselves regardless of what they pass
      return user.studentId ?? null;
    }
    if (studentId) {
      const s = await this.prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId } });
      if (!s) throw new NotFoundException('Student not found');
      return s.id;
    }
    return null;
  }

  async borrow(user: AuthUser, dto: BorrowDto) {
    const book = await this.prisma.libraryBook.findFirst({ where: { id: dto.bookId, schoolId: user.schoolId } });
    if (!book) throw new NotFoundException('Book not found');
    if (book.availableCopies < 1) throw new BadRequestException('No copies available');
    const studentId = await this.resolveBorrowerStudent(user, dto.studentId);
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + BORROW_DAYS);
    const [txn] = await this.prisma.$transaction([
      this.prisma.libraryTransaction.create({
        data: {
          bookId: book.id, studentId,
          borrowerUserId: studentId ? null : user.userId,
          type: 'borrow', dueAt,
        },
      }),
      this.prisma.libraryBook.update({
        where: { id: book.id },
        data: { availableCopies: { decrement: 1 } },
      }),
    ]);
    await this.audit.log(user, 'library', 'book.borrow', book.id, { txnId: txn.id });
    return txn;
  }

  async returnBook(user: AuthUser, txnId: string) {
    const txn = await this.prisma.libraryTransaction.findFirst({
      where: { id: txnId, type: 'borrow', returnedAt: null, book: { schoolId: user.schoolId } },
    });
    if (!txn) throw new NotFoundException('Active borrow not found');
    const now = new Date();
    let fine = 0;
    if (txn.dueAt && now > txn.dueAt) {
      fine = Math.ceil((now.getTime() - txn.dueAt.getTime()) / 86400000) * FINE_PER_DAY;
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.libraryTransaction.update({
        where: { id: txnId },
        data: { returnedAt: now, fine },
      }),
      this.prisma.libraryBook.update({
        where: { id: txn.bookId },
        data: { availableCopies: { increment: 1 } },
      }),
    ]);
    await this.audit.log(user, 'library', 'book.return', txn.bookId, { txnId, fine });
    return updated;
  }

  async reserve(user: AuthUser, dto: BorrowDto) {
    const book = await this.prisma.libraryBook.findFirst({ where: { id: dto.bookId, schoolId: user.schoolId } });
    if (!book) throw new NotFoundException('Book not found');
    const studentId = await this.resolveBorrowerStudent(user, dto.studentId);
    return this.prisma.libraryTransaction.create({
      data: {
        bookId: book.id, studentId,
        borrowerUserId: studentId ? null : user.userId,
        type: 'reserve',
      },
    });
  }

  async payFine(user: AuthUser, txnId: string) {
    const txn = await this.prisma.libraryTransaction.findFirst({
      where: { id: txnId, book: { schoolId: user.schoolId }, fine: { gt: 0 }, finePaid: false },
    });
    if (!txn) throw new NotFoundException('Unpaid fine not found');
    return this.prisma.libraryTransaction.update({ where: { id: txnId }, data: { finePaid: true } });
  }

  async transactions(user: AuthUser, q: PageQuery & { studentId?: string; active?: string; type?: string }) {
    const { skip, take, page, pageSize } = pageArgs(q);
    // parent/student scoping: only own/child transactions
    let studentFilter: object = {};
    if (user.role === 'student') {
      studentFilter = { studentId: user.studentId ?? '' };
    } else if (user.role === 'parent') {
      const ids = await this.scope.accessibleStudentIds(user);
      studentFilter = { studentId: { in: ids } };
    } else if (q.studentId) {
      studentFilter = { studentId: q.studentId };
    }
    const where = {
      book: { schoolId: user.schoolId },
      ...(studentFilter as object),
      ...(q.active === 'true' ? { type: 'borrow' as never, returnedAt: null } : {}),
      ...(q.type ? { type: q.type as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.libraryTransaction.findMany({
        where, skip, take, orderBy: { issuedAt: 'desc' },
        include: {
          book: { select: { id: true, title: true, author: true } },
          student: { select: { id: true, admissionNo: true, user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.libraryTransaction.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async fines(user: AuthUser) {
    const rows = await this.prisma.libraryTransaction.findMany({
      where: { book: { schoolId: user.schoolId }, fine: { gt: 0 } },
      orderBy: { issuedAt: 'desc' },
      include: {
        book: { select: { title: true } },
        student: { select: { admissionNo: true, user: { select: { firstName: true, lastName: true } } } },
      },
    });
    const outstanding = rows.filter((r) => !r.finePaid).reduce((a, r) => a + Number(r.fine), 0);
    return { rows, outstanding };
  }
}

@Controller('library')
export class LibraryController {
  constructor(private readonly svc: LibraryService) {}

  @Get('books')
  @RequirePermission('library', 'read')
  listBooks(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { category?: string; available?: string }) {
    return this.svc.listBooks(user, q);
  }

  @Post('books')
  @RequirePermission('library', 'create')
  createBook(@CurrentUser() user: AuthUser, @Body() dto: BookDto) {
    return this.svc.createBook(user, dto);
  }

  @Patch('books/:id')
  @RequirePermission('library', 'update')
  updateBook(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<BookDto>) {
    return this.svc.updateBook(user, id, dto);
  }

  @Delete('books/:id')
  @RequirePermission('library', 'delete')
  deleteBook(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteBook(user, id);
  }

  @Post('borrow')
  @RequirePermission('library', 'create')
  borrow(@CurrentUser() user: AuthUser, @Body() dto: BorrowDto) {
    return this.svc.borrow(user, dto);
  }

  @Post('return/:txnId')
  @RequirePermission('library', 'update')
  returnBook(@CurrentUser() user: AuthUser, @Param('txnId') txnId: string) {
    return this.svc.returnBook(user, txnId);
  }

  @Post('reserve')
  @RequirePermission('library', 'create')
  reserve(@CurrentUser() user: AuthUser, @Body() dto: BorrowDto) {
    return this.svc.reserve(user, dto);
  }

  @Post('fines/:txnId/pay')
  @RequirePermission('library', 'update')
  payFine(@CurrentUser() user: AuthUser, @Param('txnId') txnId: string) {
    return this.svc.payFine(user, txnId);
  }

  @Get('transactions')
  @RequirePermission('library', 'read')
  transactions(@CurrentUser() user: AuthUser, @Query() q: PageQuery & { studentId?: string; active?: string; type?: string }) {
    return this.svc.transactions(user, q);
  }

  @Get('fines')
  @RequirePermission('library', 'read')
  fines(@CurrentUser() user: AuthUser) {
    return this.svc.fines(user);
  }
}

@Module({ controllers: [LibraryController], providers: [LibraryService] })
export class LibraryModule {}
