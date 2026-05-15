import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';

import { appConfig, authConfig, webConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { COOKIE_REFRESH, clearAuthCookies, setAuthCookies } from './cookies';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { SkipCsrf } from './decorators/skip-csrf.decorator';
import { GoogleOAuthService, OAuthStateError } from './google-oauth.service';
import { safeReturnTo } from './return-to';
import { InvalidRefreshTokenError, SessionService, type SessionClient } from './session.service';
import { TurnstileService } from './turnstile.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';
import { type GoogleStartRequest, googleStartRequestSchema } from '../shared/schemas/auth.schemas';
import { getClientIp } from '../utils/get-client-ip';
import type { AuthenticatedUser } from './types';

const TURNSTILE_ACTION_LOGIN = 'login';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
    @Inject(webConfig.KEY) private readonly web: ConfigType<typeof webConfig>,
    private readonly authService: AuthService,
    private readonly googleOauth: GoogleOAuthService,
    private readonly turnstile: TurnstileService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthController.name);
  }

  /**
   * Step 1 of the OAuth dance. Frontend renders Turnstile, gets the token,
   * POSTs it here. We verify with Cloudflare, persist OAuth state (PKCE/nonce),
   * and return the Google authorization URL for the client to redirect to.
   *
   * Anonymous endpoint — no auth cookies attached, no CSRF token expected
   * (Turnstile is the bot/abuse defense for this path).
   */
  @Public()
  @SkipCsrf()
  @Post('google/start')
  async googleStart(
    @Body(new ZodValidationPipe(googleStartRequestSchema)) body: GoogleStartRequest,
    @Req() req: Request,
  ): Promise<{ redirectUrl: string }> {
    const ip = getClientIp(req) ?? null;
    const userAgent = req.headers['user-agent'] ?? null;

    const ok = await this.turnstile.verify(
      body.turnstileToken,
      ip ?? undefined,
      TURNSTILE_ACTION_LOGIN,
    );
    if (!ok) {
      throw new BadRequestException('turnstile_failed');
    }

    const returnTo = body.returnTo ? safeReturnTo(body.returnTo, this.web.frontendUrl) : null;

    const redirectUrl = await this.googleOauth.buildAuthorizationUrl({
      returnTo,
      ip,
      userAgent,
    });

    return { redirectUrl };
  }

  /**
   * Google redirects the browser here with `?code=&state=`. We verify state
   * (atomic one-time consume), exchange the code (PKCE), validate the ID token
   * (signature/nonce/iss/aud/exp), then create a session and redirect to
   * the safe `returnTo` on the frontend with cookies attached.
   */
  @Public()
  @Get('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Reconstruct the full URL of *this* request so openid-client can parse
    // ?code & ?state from the callback. `app.set('trust proxy', true)` in main.ts
    // makes req.protocol reflect Cloudflare's X-Forwarded-Proto (https).
    const host = req.headers.host ?? '';
    const fullUrl = new URL(req.originalUrl, `${req.protocol}://${host}`);

    try {
      const profile = await this.googleOauth.handleCallback(fullUrl);
      const ip = getClientIp(req) ?? null;
      const userAgent = req.headers['user-agent'] ?? null;
      const client: SessionClient = 'web';

      const { accessToken, refreshRaw } = await this.authService.loginWithGoogle({
        profile,
        client,
        ip,
        userAgent,
      });

      setAuthCookies({
        res,
        accessToken,
        refreshRaw,
        refreshTtlMs: this.tokens.getRefreshTtlMs(client),
        authCfg: this.auth,
        appEnv: this.app.NODE_ENV,
      });

      const target = safeReturnTo(profile.returnTo, this.web.frontendUrl);
      res.redirect(302, target);
    } catch (error) {
      this.logger.warn({ err: error }, 'OAuth callback failed');
      const message =
        error instanceof OAuthStateError
          ? error.reason
          : ((error as { message?: string }).message ?? 'oauth_failed');
      const target = new URL('/login', this.web.frontendUrl);
      target.searchParams.set('error', message);
      res.redirect(302, target.toString());
    }
  }

  /**
   * Rotate refresh-token + access token. Reads refresh from httpOnly cookie
   * (web) or Authorization: Bearer (mobile, later). On reuse detection the
   * entire user's session chain is revoked (handled inside SessionService).
   */
  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    const refreshFromCookie = (req as Request & { cookies: Record<string, string | undefined> })
      .cookies?.[COOKIE_REFRESH];
    const refreshFromHeader = readBearerToken(req.headers.authorization);
    const refreshRaw = refreshFromCookie ?? refreshFromHeader;

    if (!refreshRaw) {
      throw new UnauthorizedException('refresh_missing');
    }

    const ip = getClientIp(req) ?? null;
    const userAgent = req.headers['user-agent'] ?? null;

    try {
      const { session, refreshRaw: newRefreshRaw } = await this.sessions.rotate({
        refreshRaw,
        ip,
        userAgent,
      });

      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: session.userId },
        select: { id: true, role: true, disabledAt: true },
      });

      if (user.disabledAt) {
        clearAuthCookies(res, this.auth, this.app.NODE_ENV);
        await this.sessions.revoke(session.id, { ip, userAgent });
        throw new UnauthorizedException('account_disabled');
      }

      const accessToken = await this.tokens.signAccess({
        userId: user.id,
        role: user.role,
        sid: session.id,
      });

      const client = (session.client as SessionClient) ?? 'web';
      setAuthCookies({
        res,
        accessToken,
        refreshRaw: newRefreshRaw,
        refreshTtlMs: this.tokens.getRefreshTtlMs(client),
        authCfg: this.auth,
        appEnv: this.app.NODE_ENV,
      });

      res.json({ ok: true });
    } catch (error) {
      clearAuthCookies(res, this.auth, this.app.NODE_ENV);
      if (error instanceof InvalidRefreshTokenError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  /**
   * End the current session (revoke its refresh chain). The access token from
   * a leaked JWT remains valid until expiry, but `isSessionActive` (Redis-cached)
   * will start returning false within ~30s of this call, so the guard rejects it.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.sessions.revoke(user.sid, {
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    clearAuthCookies(res, this.auth, this.app.NODE_ENV);
    return { ok: true };
  }

  /**
   * Revoke ALL active sessions for the current user (every device).
   * Step-up reauth: requires the access JWT to have been issued in the last
   * 5 minutes; otherwise client must re-login before performing this destructive op.
   */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true; revoked: number }> {
    const ageSec = Math.floor(Date.now() / 1000) - user.iat;
    if (ageSec > 5 * 60) {
      throw new ForbiddenException('reauth_required');
    }

    const revoked = await this.sessions.revokeAllForUser(user.id, {
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    clearAuthCookies(res, this.auth, this.app.NODE_ENV);
    return { ok: true, revoked };
  }

  /**
   * Returns the authenticated user — used by the frontend BFF / RSC to render
   * the current session context. Always reads fresh from the DB (no client caching)
   * so that role changes / profile updates propagate immediately.
   */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const dbUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        name: true,
        avatarUrl: true,
        role: true,
      },
    });
    return { user: dbUser };
  }
}

function readBearerToken(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1] ?? null;
}
