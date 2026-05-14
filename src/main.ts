import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', true);

  const configService = app.get(ConfigService);
  const NODE_ENV = configService.getOrThrow<'development' | 'production' | 'test'>('app.NODE_ENV');
  const PORT = configService.getOrThrow<number>('app.PORT');
  const frontendUrl = configService.getOrThrow<string>('web.frontendUrl');

  app.use(
    helmet({
      contentSecurityPolicy: NODE_ENV === 'development' ? false : undefined,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
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
