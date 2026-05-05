import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AuthService } from './auth.service';
import { ListSessionsQueryDto, ListSessionsResponseDto } from './dto/list-sessions.dto';
import { SignInDto, SignInResponseDto } from './dto/sign-in.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-in')
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiBody({ type: SignInDto })
  @ZodResponse({ type: SignInResponseDto })
  signIn(@Body() body: SignInDto): SignInResponseDto {
    return this.authService.signIn(body);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List auth sessions (z.coerce query example)' })
  @ZodResponse({ type: ListSessionsResponseDto })
  listSessions(@Query() query: ListSessionsQueryDto): ListSessionsResponseDto {
    return this.authService.listSessions(query);
  }
}
