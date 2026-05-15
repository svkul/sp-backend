import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Paths whose values must NEVER appear in logs.
 * Pino replaces matched values with `[Redacted]`.
 */
const REDACT_PATHS = [
  // Request headers carrying credentials / tokens.
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'req.headers["cf-connecting-ip"]',
  // Response headers leaking session material.
  'res.headers["set-cookie"]',
  // Common token/secret keys in arbitrary objects we may log.
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.refreshRaw',
  '*.tokenHash',
  '*.codeVerifier',
  '*.code_verifier',
  '*.id_token',
  '*.access_token',
  '*.code',
  '*.nonce',
  '*.state',
  '*.turnstileToken',
];

const SKIP_AUTOLOG_URLS = new Set<string>(['/healthz', '/favicon.ico']);

export function buildPinoOptions(env: 'development' | 'production' | 'test'): Params {
  const isProd = env === 'production';

  return {
    pinoHttp: {
      level: isProd ? 'info' : 'debug',
      redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
      autoLogging: {
        ignore: (req: IncomingMessage) => SKIP_AUTOLOG_URLS.has(req.url ?? ''),
      },
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const headerId = req.headers['cf-ray'] ?? req.headers['x-request-id'];
        const id = (Array.isArray(headerId) ? headerId[0] : headerId) ?? randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
        if (err) return 'error';
        const status = res.statusCode;
        if (status >= 500) return 'error';
        if (status >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req(req: IncomingMessage & { id?: string; method?: string; url?: string }) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
          };
        },
        res(res: ServerResponse) {
          return { statusCode: res.statusCode };
        },
      },
      ...(isProd
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname,reqId',
              },
            },
          }),
    },
  };
}
