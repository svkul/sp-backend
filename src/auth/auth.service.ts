import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Session, User } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import type { GoogleProfile } from './google-oauth.service';
import { SessionService, type SessionClient } from './session.service';
import { TokenService } from './token.service';

interface LoginWithGoogleArgs {
  profile: GoogleProfile;
  client: SessionClient;
  ip?: string | null;
  userAgent?: string | null;
}

interface LoginResult {
  user: User;
  session: Session;
  accessToken: string;
  refreshRaw: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  /**
   * Complete the login flow after Google has authenticated the user.
   *
   *   1. Atomically link Google identity → existing user (by `providerAccountId`,
   *      then by verified email), or create a new user.
   *   2. Refuse disabled accounts.
   *   3. Bump `lastLoginAt` + sync `emailVerified` from Google's claim.
   *   4. Attach a Device record (one per user + UA combo, deduped softly).
   *   5. Create a fresh session and sign an access JWT.
   */
  async loginWithGoogle({
    profile,
    client,
    ip,
    userAgent,
  }: LoginWithGoogleArgs): Promise<LoginResult> {
    const user = await this.upsertUserFromGoogle(profile);
    if (user.disabledAt) {
      this.logger.warn({ userId: user.id }, 'Login refused: account disabled');
      throw new ForbiddenException('account_disabled');
    }

    const device = await this.ensureDevice({ userId: user.id, userAgent, ip, platform: client });

    const { session, refreshRaw } = await this.sessions.create({
      userId: user.id,
      client,
      deviceId: device?.id ?? null,
      ip,
      userAgent,
    });

    const accessToken = await this.tokens.signAccess({
      userId: user.id,
      role: user.role,
      sid: session.id,
    });

    return { user, session, accessToken, refreshRaw };
  }

  private async upsertUserFromGoogle(profile: GoogleProfile): Promise<User> {
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: profile.providerUserId,
        },
      },
      include: { user: true },
    });

    if (existingAccount) {
      return this.prisma.user.update({
        where: { id: existingAccount.userId },
        data: {
          name: profile.name ?? existingAccount.user.name,
          avatarUrl: profile.picture ?? existingAccount.user.avatarUrl,
          emailVerified: profile.emailVerified || existingAccount.user.emailVerified,
          lastLoginAt: new Date(),
        },
      });
    }

    // Match by verified email — only if the existing user's email is also verified.
    // Otherwise we'd risk linking to an unverified account that someone else owns.
    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail && byEmail.emailVerified) {
      await this.prisma.account.create({
        data: {
          userId: byEmail.id,
          provider: 'google',
          providerAccountId: profile.providerUserId,
        },
      });
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          name: profile.name ?? byEmail.name,
          avatarUrl: profile.picture ?? byEmail.avatarUrl,
          lastLoginAt: new Date(),
        },
      });
    }

    return this.prisma.user.create({
      data: {
        email: profile.email,
        emailVerified: profile.emailVerified,
        name: profile.name,
        avatarUrl: profile.picture,
        lastLoginAt: new Date(),
        accounts: {
          create: {
            provider: 'google',
            providerAccountId: profile.providerUserId,
          },
        },
      },
    });
  }

  private async ensureDevice(args: {
    userId: string;
    userAgent?: string | null;
    ip?: string | null;
    platform: SessionClient;
  }) {
    if (!args.userAgent) {
      return null;
    }
    const recent = await this.prisma.device.findFirst({
      where: { userId: args.userId, userAgent: args.userAgent, platform: args.platform },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      return recent;
    }
    return this.prisma.device.create({
      data: {
        userId: args.userId,
        platform: args.platform,
        userAgent: args.userAgent,
        ip: args.ip ?? null,
      },
    });
  }
}
