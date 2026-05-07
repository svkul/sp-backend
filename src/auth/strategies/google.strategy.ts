import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import type { OAuthLoginProfile } from '../../shared/schemas';

interface GoogleProfile {
  id: string;
  emails?: Array<{ value?: string }>;
  displayName?: string;
  photos?: Array<{ value?: string }>;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('oauth.googleClientId'),
      clientSecret: configService.getOrThrow<string>('oauth.googleClientSecret'),
      callbackURL: configService.getOrThrow<string>('oauth.googleCallbackUrl'),
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: GoogleProfile,
    done: VerifyCallback,
  ) {
    const { id, emails, displayName, photos } = profile;

    const user: Pick<
      OAuthLoginProfile,
      'provider' | 'providerAccountId' | 'email' | 'name' | 'avatarUrl'
    > = {
      provider: 'google',
      providerAccountId: id,
      email: emails?.[0]?.value ?? '',
      name: displayName,
      avatarUrl: photos?.[0]?.value,
    };

    // Pass normalized OAuth user profile to request context.
    done(null, user);
  }
}
