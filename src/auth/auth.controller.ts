import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { Response } from 'express';

import { getClientIp } from '../utils/get-client-ip';
import { AuthService } from './auth.service';
import { ACCESS_TOKEN_COOKIE_MAX_AGE_MS, REFRESH_TOKEN_COOKIE_MAX_AGE_MS } from './constants';
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
    // Web flow: HttpOnly cookies (camelCase or legacy snake_case)
    const cookieToken =
      typeof cookieRecord?.refreshToken === 'string'
        ? cookieRecord.refreshToken
        : typeof cookieRecord?.refresh_token === 'string'
          ? cookieRecord.refresh_token
          : undefined;

    const authHeader = req.headers.authorization as unknown;
    const bearerToken =
      typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : undefined;

    const token = bearerToken || cookieToken;

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

    const cookieBase = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict' as const,
    };

    res.cookie('accessToken', result.accessToken, {
      ...cookieBase,
      maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
      path: '/',
    });
    res.cookie('refreshToken', result.refreshToken, {
      ...cookieBase,
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
      path: '/api/auth/refresh',
    });

    return res.redirect(callbackUrl.toString());
  }

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

  @Post('logout')
  @ApiOperation({ summary: 'Revoke current refresh token session' })
  @ZodResponse({ type: LogoutResponseDto })
  async logout(@Req() req: RefreshTokenRequest) {
    const token = this.extractRefreshToken(req);

    return this.authService.logout(token);
  }

  @Post('logout-all')
  @ApiOperation({ summary: 'Revoke all sessions for current user' })
  @ZodResponse({ type: LogoutResponseDto })
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Req() req: AuthenticatedRequest) {
    return this.authService.logoutAll(req.user.sub);
  }
}
