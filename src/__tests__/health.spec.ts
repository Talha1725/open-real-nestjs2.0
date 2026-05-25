import { describe, it, expect } from 'vitest';
import { HealthController } from '../health/health.controller.js';

describe('HealthController', () => {
  const prisma = {
    client: {
      $queryRawUnsafe: async () => [{ '?column?': 1 }],
    },
  } as any;
  const redis = {
    getClient: () => ({
      ping: async () => 'PONG',
    }),
  } as any;
  const controller = new HealthController(prisma, redis);

  it('should return status ok', () => {
    const result = controller.check();
    expect(result).toHaveProperty('status', 'ok');
  });

  it('should return a timestamp', () => {
    const result = controller.check();
    expect(result).toHaveProperty('timestamp');
    expect(typeof result.timestamp).toBe('string');
  });

  it('should expose a liveness alias', () => {
    const result = controller.live();
    expect(result).toHaveProperty('status', 'ok');
  });

  it('should report ready when required dependencies are reachable', async () => {
    const result = await controller.ready();
    expect(result).toMatchObject({
      status: 'ready',
      checks: {
        database: { healthy: true },
        redis: { healthy: true },
      },
    });
  });
});
