import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import type {
  LogoutResponse,
  MeResponse,
  OAuthLoginProfile,
  ProtectedResponse,
  TokenPairResponse,
} from '../shared/schemas';
import { parseDurationMs } from '../utils/parse-duration';

import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from './constants';
import type { RequestMeta } from './types/request-meta.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private jwt: JwtService,
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

    return this.issueTokens(user.id, device.id, profile);
  }

  // =========================
  // ISSUE TOKENS
  // =========================

  private async issueTokens(
    userId: string,
    deviceId: string | null,
    meta?: RequestMeta,
  ): Promise<TokenPairResponse> {
    const accessToken = this.generateAccessToken(userId);
    const refreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.session.create({
      data: {
        userId,
        deviceId: deviceId ?? undefined,
        tokenHash,
        expiresAt: this.getRefreshExpiry(),
        userAgent: meta?.userAgent,
        ip: meta?.ip,
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

    const session = await this.prisma.session.findFirst({
      where: { tokenHash },
    });

    if (!session) throw new UnauthorizedException();

    // reuse detection

    if (session.revoked) {
      await this.prisma.session.updateMany({
        where: { userId: session.userId },
        data: { revoked: true, revokedAt: new Date() },
      });

      throw new UnauthorizedException('Token reuse detected');
    }

    const now = new Date();

    if (session.expiresAt < now) {
      await this.prisma.session.updateMany({
        where: {
          id: session.id,
          revoked: false,
          expiresAt: { lt: now },
        },
        data: { revoked: true, revokedAt: now },
      });

      throw new UnauthorizedException('Expired refresh token');
    }

    // revoke old
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revoked: true, revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(session.userId, session.deviceId);

    return tokens;
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

    const session = await this.prisma.session.findFirst({
      where: { tokenHash },
      select: { id: true, userId: true, revoked: true, expiresAt: true },
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    if (session.revoked) {
      await this.prisma.session.updateMany({
        where: { userId: session.userId },
        data: { revoked: true, revokedAt: new Date() },
      });

      throw new UnauthorizedException('Token reuse detected');
    }

    const now = new Date();

    if (session.expiresAt < now) {
      await this.prisma.session.updateMany({
        where: {
          id: session.id,
          revoked: false,
          expiresAt: { lt: now },
        },
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
    return this.jwt.sign({ sub: userId }, { expiresIn: ACCESS_TOKEN_TTL });
  }

  private getRefreshExpiry() {
    return new Date(Date.now() + parseDurationMs(REFRESH_TOKEN_TTL));
  }

  private generateRefreshToken() {
    return crypto.randomBytes(64).toString('hex');
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
