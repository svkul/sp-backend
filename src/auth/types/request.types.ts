import type { Request } from 'express';
import type { OAuthLoginProfile } from '../../shared/schemas';

export interface AuthenticatedUser {
  sub: string;
}

export type RefreshTokenRequest = Request & {
  cookies?: {
    refreshToken?: string;
  };
};

export type OAuthRequest = Request & {
  user: Pick<OAuthLoginProfile, 'provider' | 'providerAccountId' | 'email' | 'name' | 'avatarUrl'>;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};
