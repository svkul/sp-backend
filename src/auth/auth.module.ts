import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { authConfig, cloudflareConfig, oauthConfig, webConfig } from '../config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { CsrfGuard } from './guards/csrf.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [
    ConfigModule.forFeature(cloudflareConfig),
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(oauthConfig),
    ConfigModule.forFeature(webConfig),
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => ({
        secret: config.jwtAccessSecret,
        signOptions: {
          algorithm: 'HS256',
          issuer: config.jwtIssuer,
          audience: config.jwtAudience,
          // JwtModule typings require StringValue | number; pass seconds derived from the parsed ms value.
          expiresIn: Math.floor(config.accessTokenCookieMaxAgeMs / 1000),
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: config.jwtIssuer,
          audience: config.jwtAudience,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TurnstileService,
    TokenService,
    SessionService,
    GoogleOAuthService,
    JwtAuthGuard,
    RolesGuard,
    CsrfGuard,
  ],
  exports: [
    TurnstileService,
    TokenService,
    SessionService,
    GoogleOAuthService,
    JwtAuthGuard,
    RolesGuard,
    CsrfGuard,
  ],
})
export class AuthModule {}
