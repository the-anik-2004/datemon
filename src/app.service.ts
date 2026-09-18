import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getHealthCheck(): Record<string,string>{
    return {
      "status": 'ok',
      "service": 'datemon',
      "timestamp": new Date().toISOString()
    }
  }
}
