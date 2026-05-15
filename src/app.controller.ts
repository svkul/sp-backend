import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { Public } from './auth/decorators/public.decorator';
import { HealthzResponseDto } from './app/dto/healthz.dto';
import type { HealthzResponse } from './shared/schemas';

@Controller()
export class AppController {
  constructor() {}

  @Public()
  @SkipThrottle()
  @Get('healthz')
  @ApiOperation({ summary: 'Liveness probe (Railway / load balancers)' })
  @ZodResponse({ type: HealthzResponseDto })
  healthz(): HealthzResponse {
    return { ok: true };
  }
}
