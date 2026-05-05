import { Injectable } from '@nestjs/common';
import type { HelloResponse } from './shared/schemas';

@Injectable()
export class AppService {
  getHello(): HelloResponse {
    return { message: 'Hello World!' };
  }
}
