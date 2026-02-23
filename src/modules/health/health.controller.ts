import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { platform } from 'node:os';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaHealthIndicator } from './indicators/prisma.health-indicator.js';
import { RedisHealthIndicator } from './indicators/redis.health-indicator.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    const diskPath = platform() === 'win32' ? 'C:\\' : '/';

    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
      () => this.redisHealth.isHealthy('redis'),
      () => this.memory.checkHeap('memory_heap', 256 * 1024 * 1024),
      () =>
        this.disk.checkStorage('disk', {
          thresholdPercent: 0.9,
          path: diskPath,
        }),
    ]);
  }
}
