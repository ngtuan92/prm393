import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getStatus() {
    return {
      name: 'fptu-portal-be',
      status: 'ok',
    };
  }
}
