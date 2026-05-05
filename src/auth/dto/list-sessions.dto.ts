import { createZodDto } from 'nestjs-zod';
import { listSessionsQuerySchema, listSessionsResponseSchema } from '../../shared/schemas';

export class ListSessionsQueryDto extends createZodDto(listSessionsQuerySchema) {}

export class ListSessionsResponseDto extends createZodDto(listSessionsResponseSchema) {}
