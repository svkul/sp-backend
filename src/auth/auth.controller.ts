import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { Response } from 'express';

import { getClientIp } from '../utils/get-client-ip';
import { AuthService } from './auth.service';
import { THROTTLE_AUTH_SENSITIVE } from './constants';
import { LogoutResponseDto, MeResponseDto, RefreshResponseDto } from './dto/session-actions.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OAuthRequest,
  RefreshTokenRequest,
} from './types/request.types';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private extractRefreshToken(req: RefreshTokenRequest): string {
    const cookies = req.cookies as unknown;
    const cookieRecord =
      typeof cookies === 'object' && cookies !== null ? (cookies as Record<string, unknown>) : null;
    // Web: HttpOnly cookie `refreshToken`. Mobile: Authorization Bearer (preferred when both exist).
    const cookieToken =
      typeof cookieRecord?.refreshToken === 'string' ? cookieRecord.refreshToken : undefined;

    const authHeader = req.headers.authorization;
    const bearerToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim() || undefined
        : undefined;

    const token = bearerToken ?? cookieToken;

    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }

    return token;
  }

  @Get('google')
  @ApiOperation({ summary: 'Redirect to Google OAuth' })
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Passport handles redirect to OAuth provider.
  }

  @Throttle(THROTTLE_AUTH_SENSITIVE)
  @Get('google/callback')
  @ApiOperation({ summary: 'Callback from Google OAuth' })
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: OAuthRequest, @Res() res: Response) {
    const userAgent = req.headers['user-agent'];
    const ip = getClientIp(req);

    const result = await this.authService.oAuthLogin({
      ...req.user,
      userAgent,
      ip,
      deviceName: 'web',
      platform: 'web',
    });

    const frontendUrl = this.configService.getOrThrow<string>('web.frontendUrl');
    const callbackUrl = new URL('/auth/callback', frontendUrl);
    const isProduction =
      this.configService.getOrThrow<'development' | 'production' | 'test'>('app.NODE_ENV') ===
      'production';
    const accessCookieMaxAge = this.configService.getOrThrow<number>(
      'auth.accessTokenCookieMaxAgeMs',
    );
    const refreshCookieMaxAge = this.configService.getOrThrow<number>('auth.refreshTokenTtlWebMs');

    const cookieBase = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict' as const,
    };

    res.cookie('accessToken', result.accessToken, {
      ...cookieBase,
      maxAge: accessCookieMaxAge,
      path: '/',
    });

    res.cookie('refreshToken', result.refreshToken, {
      ...cookieBase,
      maxAge: refreshCookieMaxAge,
      path: '/auth/refresh',
    });

    return res.redirect(callbackUrl.toString());
  }

  @Throttle(THROTTLE_AUTH_SENSITIVE)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and return new access token' })
  @ZodResponse({ type: RefreshResponseDto })
  async refresh(@Req() req: RefreshTokenRequest) {
    const token = this.extractRefreshToken(req);

    const data = await this.authService.refresh(token);
    return { accessToken: data.accessToken, refreshToken: data.refreshToken };
  }

  @Get('me')
  @ApiOperation({ summary: 'Return current user by access token' })
  @ZodResponse({ type: MeResponseDto })
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: AuthenticatedRequest) {
    return this.authService.meByUserId(req.user.sub);
  }

  @Post('protected')
  @ApiOperation({ summary: 'Protected route' })
  @UseGuards(JwtAuthGuard)
  protected() {
    return this.authService.protected();
  }

  @Throttle(THROTTLE_AUTH_SENSITIVE)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke current refresh token session' })
  @ZodResponse({ type: LogoutResponseDto })
  async logout(@Req() req: RefreshTokenRequest) {
    const token = this.extractRefreshToken(req);

    return this.authService.logout(token);
  }

  @Throttle(THROTTLE_AUTH_SENSITIVE)
  @Post('logout-all')
  @ApiOperation({ summary: 'Revoke all sessions for current user' })
  @ZodResponse({ type: LogoutResponseDto })
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Req() req: AuthenticatedRequest) {
    const userAgent = req.headers['user-agent'];
    const ip = getClientIp(req);
    return this.authService.logoutAll(req.user.sub, { userAgent, ip });
  }
}
