import { createZodDto } from 'nestjs-zod';
import {
  logoutResponseSchema,
  refreshResponseSchema,
  sessionResponseSchema,
} from '../../shared/schemas';

export class RefreshResponseDto extends createZodDto(refreshResponseSchema) {}

export class LogoutResponseDto extends createZodDto(logoutResponseSchema) {}

export class SessionResponseDto extends createZodDto(sessionResponseSchema) {}
