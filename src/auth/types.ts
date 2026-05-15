import type { Role } from '@prisma/client';

/** Subject populated by JwtAuthGuard on `req.user`. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
  sid: string;
  /** Issued-at (seconds) of the access JWT; drives step-up reauth checks. */
  iat: number;
}
