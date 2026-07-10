import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CachedPerm {
  scope: string | null;
}

/**
 * Loads the permission matrix from the DB with a short in-memory cache.
 * The access-control module calls invalidate() after editing the matrix.
 */
@Injectable()
export class PermissionsService {
  private cache = new Map<string, Map<string, CachedPerm>>();
  private loadedAt = new Map<string, number>();
  private readonly ttlMs = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  invalidate(schoolId?: string) {
    if (schoolId) {
      this.cache.delete(schoolId);
      this.loadedAt.delete(schoolId);
    } else {
      this.cache.clear();
      this.loadedAt.clear();
    }
  }

  private async load(schoolId: string): Promise<Map<string, CachedPerm>> {
    const at = this.loadedAt.get(schoolId) ?? 0;
    const cached = this.cache.get(schoolId);
    if (cached && Date.now() - at < this.ttlMs) return cached;

    const rows = await this.prisma.permission.findMany({ where: { schoolId } });
    const map = new Map<string, CachedPerm>();
    for (const r of rows) {
      map.set(`${r.role}:${r.module}:${r.action}`, { scope: r.scope ?? null });
    }
    this.cache.set(schoolId, map);
    this.loadedAt.set(schoolId, Date.now());
    return map;
  }

  async find(
    schoolId: string,
    role: string,
    module: string,
    action: string,
  ): Promise<CachedPerm | null> {
    const map = await this.load(schoolId);
    return map.get(`${role}:${module}:${action}`) ?? null;
  }
}
