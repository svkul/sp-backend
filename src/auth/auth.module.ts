import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';

import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('auth.jwtAccessSecret'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>('auth.accessTtl') as NonNullable<
            JwtModuleOptions['signOptions']
          >['expiresIn'],
          algorithm: 'HS256' as const,
          issuer: configService.getOrThrow<string>('auth.jwtIssuer'),
          audience: configService.getOrThrow<string>('auth.jwtAudience'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, JwtStrategy],
})
export class AuthModule {}
