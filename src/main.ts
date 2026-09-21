import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const preferredPort = Number(process.env.PORT ?? 3000);
  const fallbackPorts = [preferredPort, preferredPort + 1, preferredPort + 2, preferredPort + 3];

  for (const port of fallbackPorts) {
    try {
      await app.listen(port);
      console.log(`DATEMON backend running on http://localhost:${port}/api/v1`);
      return;
    } catch (error: any) {
      if (error?.code !== 'EADDRINUSE' || port === fallbackPorts.at(-1)) {
        throw error;
      }
    }
  }
}

await bootstrap();
