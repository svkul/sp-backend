import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

/**
 * Require one of the given roles. Used together with `RolesGuard`.
 * Example: `@Roles('ADMIN')` — accessible only to admins.
 */
export const ROLES_KEY = 'auth:roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
