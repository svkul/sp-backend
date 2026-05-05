import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { GetHelloResponseDto } from './app/dto/get-hello.dto';
import { AppService } from './app.service';
import type { HelloResponse } from './shared/schemas';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get hello message' })
  @ZodResponse({ type: GetHelloResponseDto })
  getHello(): HelloResponse {
    return this.appService.getHello();
  }
}
