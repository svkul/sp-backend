import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // Pipe Nest's framework logs through pino so they share the same redaction,
  // formatting and transport as application logs.
  app.useLogger(app.get(PinoNestLogger));
  app.set('trust proxy', true);

  const configService = app.get(ConfigService);
  const NODE_ENV = configService.getOrThrow<'development' | 'production' | 'test'>('app.NODE_ENV');
  const PORT = configService.getOrThrow<number>('app.PORT');
  const corsOrigins = configService.getOrThrow<string[]>('web.corsOrigins');

  const isProd = NODE_ENV === 'production';

  app.use(
    helmet({
      // Strict CSP for backend HTML responses (Swagger in dev, error pages in prod).
      // Turnstile widget + Google login form-action are allow-listed.
      contentSecurityPolicy: isProd
        ? {
            useDefaults: true,
            directives: {
              'default-src': ["'self'"],
              'script-src': ["'self'", 'https://challenges.cloudflare.com'],
              'style-src': ["'self'", "'unsafe-inline'"],
              'img-src': ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
              'connect-src': ["'self'", 'https://challenges.cloudflare.com'],
              'frame-src': ['https://challenges.cloudflare.com'],
              'frame-ancestors': ["'none'"],
              'form-action': ["'self'", 'https://accounts.google.com'],
              'base-uri': ["'none'"],
              'object-src': ["'none'"],
              'upgrade-insecure-requests': [],
            },
          }
        : false,
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      // API is consumed only by porych.com / api.porych.com — same registrable domain.
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
      noSniff: true,
      hidePoweredBy: true,
    }),
  );

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()',
    );
    next();
  });

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Authorization'],
    maxAge: 600,
  });

  const cookieSecret = configService.getOrThrow<string>('auth.cookieSecret');
  app.use(cookieParser(cookieSecret));

  if (NODE_ENV === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Backend API')
      .setDescription('API documentation')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    const cleanedDocument = cleanupOpenApiDoc(document);
    SwaggerModule.setup('docs', app, cleanedDocument);
  }

  await app.listen(PORT);
}
bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});
