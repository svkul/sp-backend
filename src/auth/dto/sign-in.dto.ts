import { createZodDto } from 'nestjs-zod';
import { signInSchema, signInResponseSchema } from '../../shared/schemas';

export class SignInDto extends createZodDto(signInSchema) {}

export class SignInResponseDto extends createZodDto(signInResponseSchema) {}
