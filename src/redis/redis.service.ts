import { Inject, Injectable, OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';

import { redisConfig } from '../config/configuration';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;

  constructor(
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {
    this.client = new Redis(this.config.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /** Set a key with TTL in milliseconds. Returns OK on success. */
  async setWithTtl(key: string, value: string, ttlMs: number): Promise<'OK'> {
    return this.client.set(key, value, 'PX', ttlMs);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /** SET with NX flag and TTL — used as idempotency lock (returns null if key already exists). */
  async setIfNotExists(key: string, value: string, ttlMs: number): Promise<'OK' | null> {
    return this.client.set(key, value, 'PX', ttlMs, 'NX');
  }
}
