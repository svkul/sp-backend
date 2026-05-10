import { createZodDto } from 'nestjs-zod';
import {
  logoutResponseSchema,
  meResponseSchema,
  refreshResponseSchema,
} from '../../shared/schemas';

export class MeResponseDto extends createZodDto(meResponseSchema) {}

export class RefreshResponseDto extends createZodDto(refreshResponseSchema) {}

export class LogoutResponseDto extends createZodDto(logoutResponseSchema) {}
