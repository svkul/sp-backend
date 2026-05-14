import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { catchError, tap, throwError } from 'rxjs';
import type { Observable } from 'rxjs';

import { getClientIp } from '../../utils/get-client-ip';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuthAudit');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();

    if (!req.url?.startsWith('/auth')) {
      return next.handle();
    }

    const { method, url } = req;
    const start = Date.now();
    const ip = getClientIp(req);

    return next.handle().pipe(
      tap(() => {
        const res = ctx.getResponse<{ statusCode?: number }>();
        const statusCode = res.statusCode ?? 0;
        this.logger.log(
          `${method} ${url} ${statusCode} ${Date.now() - start}ms ip=${ip ?? 'unknown'}`,
        );
      }),
      catchError((err: unknown) => {
        const statusCode =
          err instanceof HttpException ? err.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
        this.logger.warn(
          `${method} ${url} ${statusCode} ${Date.now() - start}ms ip=${ip ?? 'unknown'}`,
        );
        return throwError(() => err);
      }),
    );
  }
}
