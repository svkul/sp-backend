import { Injectable } from '@nestjs/common';
import type { SignInInput, SignInResponse } from '../shared/schemas';

@Injectable()
export class AuthService {
  signIn(_payload: SignInInput): SignInResponse {
    return {
      accessToken: 'demo-token',
    };
  }
}
