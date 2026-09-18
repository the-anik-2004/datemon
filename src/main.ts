import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:true,
      forbidNonWhitelisted:true,
      transform:true,
  })
  );

  const PORT=process.env.PORT ?? 3000;
  await app.listen(PORT);
  console.log(`DATEMON backend running on http://localhost:${PORT}/api/v1`);
}
await bootstrap();
