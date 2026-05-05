import { Injectable } from '@nestjs/common';
import type {
  ListSessionsQuery,
  ListSessionsResponse,
  SignInInput,
  SignInResponse,
} from '../shared/schemas';

@Injectable()
export class AuthService {
  signIn(_payload: SignInInput): SignInResponse {
    return {
      accessToken: 'demo-token',
    };
  }

  listSessions(query: ListSessionsQuery): ListSessionsResponse {
    return {
      page: query.page,
      limit: query.limit,
      items: ['session-1', 'session-2'],
    };
  }
}
