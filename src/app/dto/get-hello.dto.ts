import { createZodDto } from 'nestjs-zod';
import { helloResponseSchema } from '../../shared/schemas';

export class GetHelloResponseDto extends createZodDto(helloResponseSchema) {}
