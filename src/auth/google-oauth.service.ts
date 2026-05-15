import { Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import * as oidc from 'openid-client';

import { oauthConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';

const GOOGLE_ISSUER = new URL('https://accounts.google.com');
const SCOPES = 'openid email profile';
const STATE_TTL_MS = 10 * 60_000;

export interface GoogleProfile {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  returnTo: string | null;
}

export class OAuthStateError extends Error {
  constructor(public readonly reason: 'invalid' | 'expired' | 'consumed') {
    super(`oauth_state_${reason}`);
    this.name = 'OAuthStateError';
  }
}

@Injectable()
export class GoogleOAuthService implements OnModuleInit {
  private config!: oidc.Configuration;

  constructor(
    @Inject(oauthConfig.KEY)
    private readonly oauth: ConfigType<typeof oauthConfig>,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GoogleOAuthService.name);
  }

  async onModuleInit(): Promise<void> {
    this.config = await oidc.discovery(
      GOOGLE_ISSUER,
      this.oauth.googleClientId,
      undefined,
      oidc.ClientSecretPost(this.oauth.googleClientSecret),
    );
    this.logger.info('Google OIDC discovery completed');
  }

  /**
   * Build a Google authorization URL with PKCE (S256), state, and nonce.
   * State + codeVerifier + nonce are persisted to DB (OAuthState) for one-time use
   * on the callback. TTL is enforced via `expiresAt` column.
   */
  async buildAuthorizationUrl(args: {
    returnTo?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<string> {
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    await this.prisma.oAuthState.create({
      data: {
        state,
        codeVerifier,
        nonce,
        returnTo: args.returnTo ?? null,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });

    const url = oidc.buildAuthorizationUrl(this.config, {
      redirect_uri: this.oauth.googleCallbackUrl,
      scope: SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
      prompt: 'select_account',
      access_type: 'online',
    });

    return url.toString();
  }

  /**
   * Validate the OAuth callback request, exchange the code, validate the ID token
   * (signature, iss, aud, exp, nonce — all done by openid-client), and return a
   * normalized profile. Throws OAuthStateError / UnauthorizedException on any failure.
   *
   * Atomic claim of OAuthState row prevents both replay and concurrent reuse.
   */
  async handleCallback(currentUrl: URL): Promise<GoogleProfile> {
    const state = currentUrl.searchParams.get('state');
    if (!state) {
      throw new OAuthStateError('invalid');
    }

    const now = new Date();
    const claim = await this.prisma.oAuthState.updateMany({
      where: { state, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });

    if (claim.count === 0) {
      const existing = await this.prisma.oAuthState.findUnique({ where: { state } });
      if (!existing) throw new OAuthStateError('invalid');
      if (existing.consumedAt) throw new OAuthStateError('consumed');
      throw new OAuthStateError('expired');
    }

    const row = await this.prisma.oAuthState.findUniqueOrThrow({ where: { state } });

    let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
    try {
      tokens = await oidc.authorizationCodeGrant(this.config, currentUrl, {
        expectedState: state,
        expectedNonce: row.nonce,
        pkceCodeVerifier: row.codeVerifier,
        idTokenExpected: true,
      });
    } catch (error) {
      this.logger.warn(`Google token exchange failed: ${(error as Error).message}`);
      throw new UnauthorizedException('oauth_token_exchange_failed');
    }

    const claims = tokens.claims();
    if (!claims) {
      throw new UnauthorizedException('oauth_no_id_token');
    }

    const sub = typeof claims.sub === 'string' ? claims.sub : null;
    const email = typeof claims.email === 'string' ? claims.email : null;
    const emailVerified = claims.email_verified === true;

    if (!sub || !email) {
      throw new UnauthorizedException('oauth_missing_claims');
    }

    if (!emailVerified) {
      throw new UnauthorizedException('oauth_email_not_verified');
    }

    return {
      providerUserId: sub,
      email,
      emailVerified,
      name: typeof claims.name === 'string' ? claims.name : null,
      picture: typeof claims.picture === 'string' ? claims.picture : null,
      returnTo: row.returnTo,
    };
  }
}
