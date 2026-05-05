import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const nodeEnv = configService.getOrThrow<AppConfig['NODE_ENV']>('NODE_ENV');
  const port = configService.getOrThrow<AppConfig['PORT']>('PORT');

  if (nodeEnv === 'development') {
    const config = new DocumentBuilder()
      .setTitle('Backend API')
      .setDescription('API documentation')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    const cleanedDocument = cleanupOpenApiDoc(document);
    SwaggerModule.setup('docs', app, cleanedDocument);
  }

  await app.listen(port);
}
bootstrap().catch((error) => console.error(error));
