import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type AuthAuditPayload = {
  type: string;
  userId?: string | null;
  client?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Prisma.InputJsonValue;
};

@Injectable()
export class AuthAuditService {
  private readonly logger = new Logger(AuthAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget; never throws — auth flows must not depend on audit durability. */
  record(payload: AuthAuditPayload): void {
    void this.persist(payload);
  }

  private async persist(payload: AuthAuditPayload): Promise<void> {
    try {
      await this.prisma.authEvent.create({
        data: {
          type: payload.type,
          userId: payload.userId ?? undefined,
          client: payload.client ?? undefined,
          ip: payload.ip ?? undefined,
          userAgent: payload.userAgent ?? undefined,
          meta: payload.meta,
        },
      });
    } catch (err) {
      this.logger.error('Auth audit write failed', err instanceof Error ? err.stack : String(err));
    }
  }
}
