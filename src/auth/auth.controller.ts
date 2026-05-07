import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import type { CookieOptions, Response } from 'express';
import { AuthService } from './auth.service';
import {
  LogoutResponseDto,
  RefreshResponseDto,
  SessionResponseDto,
} from './dto/session-actions.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OAuthRequest,
  RefreshTokenRequest,
} from './types/request.types';
import { extractRequestMeta } from './utils/request-meta';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getRefreshCookieOptions(): CookieOptions {
    const nodeEnv = this.configService.getOrThrow<'development' | 'production' | 'test'>(
      'app.NODE_ENV',
    );
    const isProduction = nodeEnv === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    };
  }

  private extractRefreshToken(req: RefreshTokenRequest): string {
    const cookies = req.cookies as unknown;
    const cookieToken =
      typeof cookies === 'object' &&
      cookies !== null &&
      typeof (cookies as Record<string, unknown>).refresh_token === 'string'
        ? ((cookies as Record<string, unknown>).refresh_token as string)
        : undefined;
    const authHeader = req.headers.authorization as unknown;
    const bearerToken =
      typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : undefined;
    const token = cookieToken || bearerToken;

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
    const { userAgent, ip } = extractRequestMeta(req);

    const result = await this.authService.validateOAuthLogin({
      ...req.user,
      userAgent,
      ip,
      deviceName: 'web',
      platform: 'web',
    });

    res.cookie('refresh_token', result.refreshToken, this.getRefreshCookieOptions());

    const frontendUrl = this.configService.getOrThrow<string>('web.frontendUrl');
    return res.redirect(`${frontendUrl}/auth/callback`);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and return new access token' })
  @ZodResponse({ type: RefreshResponseDto })
  async refresh(@Req() req: RefreshTokenRequest, @Res({ passthrough: true }) res: Response) {
    const token = this.extractRefreshToken(req);

    const data = await this.authService.refresh(token);

    res.cookie?.('refresh_token', data.refreshToken, this.getRefreshCookieOptions());

    return { accessToken: data.accessToken };
  }

  @Post('access')
  @ApiOperation({ summary: 'Issue access token from current refresh session without rotation' })
  @ZodResponse({ type: RefreshResponseDto })
  async access(@Req() req: RefreshTokenRequest) {
    const token = this.extractRefreshToken(req);
    const accessToken = await this.authService.getAccessToken(token);

    return { accessToken };
  }

  @Get('session')
  @ApiOperation({ summary: 'Check whether current refresh token session is valid' })
  @ZodResponse({ type: SessionResponseDto })
  async session(@Req() req: RefreshTokenRequest) {
    let token: string;
    try {
      token = this.extractRefreshToken(req);
    } catch {
      return { authenticated: false };
    }

    const authenticated = await this.authService.hasValidSession(token);

    return { authenticated };
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
