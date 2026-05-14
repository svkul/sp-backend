import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import type {
  LogoutResponse,
  MeResponse,
  OAuthLoginProfile,
  ProtectedResponse,
  TokenPairResponse,
} from '../shared/schemas';

import {
  mapPlatformToSessionClient,
  type SessionClient,
  isSessionClient,
} from './types/session-client.types';
import type { RequestMeta } from './types/request-meta.types';

export interface SessionIssueContext extends RequestMeta {
  client: SessionClient;
  absoluteExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // =========================
  // GOOGLE LOGIN (entry point)
  // =========================

  async oAuthLogin(profile: OAuthLoginProfile): Promise<TokenPairResponse> {
    const account = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },

      include: { user: true },
    });

    let user = account?.user;

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          accounts: {
            create: {
              provider: profile.provider,

              providerAccountId: profile.providerAccountId,
            },
          },
        },
      });
    }

    const existingDevice = await this.prisma.device.findFirst({
      where: {
        userId: user.id,
        name: profile.deviceName ?? null,
        platform: profile.platform ?? null,
        userAgent: profile.userAgent ?? null,
      },
    });

    const device = existingDevice
      ? await this.prisma.device.update({
          where: { id: existingDevice.id },
          data: {
            ip: profile.ip,
            userAgent: profile.userAgent,
            platform: profile.platform,
            name: profile.deviceName,
          },
        })
      : await this.prisma.device.create({
          data: {
            userId: user.id,
            name: profile.deviceName,
            platform: profile.platform,
            userAgent: profile.userAgent,
            ip: profile.ip,
          },
        });

    return this.issueTokens(user.id, device.id, {
      client: mapPlatformToSessionClient(profile.platform),
      absoluteExpiresAt: this.newRefreshChainAbsoluteExpiry(),
      userAgent: profile.userAgent,
      ip: profile.ip,
    });
  }

  // =========================
  // ISSUE TOKENS
  // =========================

  private async issueTokens(
    userId: string,
    deviceId: string | null,
    context: SessionIssueContext,
    tx?: Prisma.TransactionClient,
  ): Promise<TokenPairResponse> {
    const db = tx ?? this.prisma;
    const accessToken = this.generateAccessToken(userId);
    const refreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(refreshToken);

    const expiresAt = this.computeRefreshExpiresAt(context.client, context.absoluteExpiresAt);

    await db.session.create({
      data: {
        userId,
        deviceId: deviceId ?? undefined,
        tokenHash,
        client: context.client,
        absoluteExpiresAt: context.absoluteExpiresAt,
        expiresAt,
        userAgent: context.userAgent,
        ip: context.ip,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  // =========================
  // REFRESH (rotation)
  // =========================

  async refresh(refreshToken: string): Promise<TokenPairResponse> {
    const tokenHash = this.hashToken(refreshToken);

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { tokenHash },
      });

      if (!session) {
        throw new UnauthorizedException();
      }

      const now = new Date();

      if (session.revoked) {
        await tx.session.updateMany({
          where: { userId: session.userId, revoked: false },
          data: { revoked: true, revokedAt: now },
        });

        throw new UnauthorizedException('Token reuse detected');
      }

      if (session.absoluteExpiresAt <= now) {
        await tx.session.updateMany({
          where: { id: session.id, revoked: false },
          data: { revoked: true, revokedAt: now },
        });

        throw new UnauthorizedException('Refresh session expired');
      }

      if (session.expiresAt < now) {
        await tx.session.updateMany({
          where: { id: session.id, revoked: false },
          data: { revoked: true, revokedAt: now },
        });

        throw new UnauthorizedException('Expired refresh token');
      }

      const updated = await tx.session.updateMany({
        where: { id: session.id, revoked: false },
        data: { revoked: true, revokedAt: now },
      });

      if (updated.count !== 1) {
        await tx.session.updateMany({
          where: { userId: session.userId, revoked: false },
          data: { revoked: true, revokedAt: now },
        });

        throw new UnauthorizedException('Token reuse detected');
      }

      return this.issueTokens(
        session.userId,
        session.deviceId,
        {
          client: this.asSessionClient(session.client),
          absoluteExpiresAt: session.absoluteExpiresAt,
          userAgent: session.userAgent ?? undefined,
          ip: session.ip ?? undefined,
        },
        tx,
      );
    });
  }

  async me(refreshToken: string): Promise<MeResponse> {
    const user = await this.getSessionUser(refreshToken);
    return { user };
  }

  async meByUserId(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return { user };
  }

  private async getSessionUser(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        revoked: true,
        expiresAt: true,
        absoluteExpiresAt: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    if (session.revoked) {
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });

      throw new UnauthorizedException('Token reuse detected');
    }

    const now = new Date();

    if (session.absoluteExpiresAt <= now) {
      await this.prisma.session.updateMany({
        where: { id: session.id, revoked: false },
        data: { revoked: true, revokedAt: now },
      });

      throw new UnauthorizedException('Refresh session expired');
    }

    if (session.expiresAt < now) {
      await this.prisma.session.updateMany({
        where: { id: session.id, revoked: false },
        data: { revoked: true, revokedAt: now },
      });

      throw new UnauthorizedException('Expired refresh token');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  // =========================
  // LOGOUT
  // =========================

  async logout(refreshToken: string): Promise<LogoutResponse> {
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.session.updateMany({
      where: { tokenHash },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    return { ok: true };
  }

  async logoutAll(userId: string): Promise<LogoutResponse> {
    await this.prisma.session.updateMany({
      where: { userId },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });

    return { ok: true };
  }

  // =========================
  // PROTECTED ROUTE
  // =========================

  protected(): ProtectedResponse {
    return { message: 'Protected route' };
  }

  // =========================
  // JWT
  // =========================

  private generateAccessToken(userId: string) {
    return this.jwt.sign({ sub: userId });
  }

  private newRefreshChainAbsoluteExpiry(): Date {
    return new Date(Date.now() + this.config.getOrThrow<number>('auth.refreshTokenAbsoluteMaxMs'));
  }

  private getRefreshTtlMsForClient(client: SessionClient): number {
    return client === 'web'
      ? this.config.getOrThrow<number>('auth.refreshTokenTtlWebMs')
      : this.config.getOrThrow<number>('auth.refreshTokenTtlMobileMs');
  }

  /** Sliding refresh deadline, capped by the chain's absolute expiry. */
  private computeRefreshExpiresAt(client: SessionClient, absoluteExpiresAt: Date): Date {
    const sliding = new Date(Date.now() + this.getRefreshTtlMsForClient(client));
    return sliding.getTime() <= absoluteExpiresAt.getTime() ? sliding : absoluteExpiresAt;
  }

  private asSessionClient(value: string): SessionClient {
    return isSessionClient(value) ? value : 'web';
  }

  private generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex');
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
