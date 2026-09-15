import { Injectable, Optional } from '@nestjs/common';

const WINDOW_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 5;
const DEFAULT_MAX_BUCKETS = 10_000;

type Bucket = { attempts: number; resetsAt: number };

@Injectable()
export class LoginRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(@Optional() private readonly maxBuckets = DEFAULT_MAX_BUCKETS) {}

  get bucketCount(): number {
    return this.buckets.size;
  }

  consume(ip: string, _username: string, now = Date.now()): boolean {
    this.#evictExpired(now);
    const current = this.buckets.get(ip);
    if (!current || current.resetsAt <= now) {
      this.#reserveBucket();
      this.buckets.set(ip, { attempts: 1, resetsAt: now + WINDOW_MS });
      return true;
    }
    if (current.attempts >= MAX_ATTEMPTS) {
      return false;
    }
    current.attempts += 1;
    return true;
  }

  reset(ip: string): void {
    this.buckets.delete(ip);
  }

  #evictExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetsAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  #reserveBucket(): void {
    while (this.buckets.size >= this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.buckets.delete(oldestKey);
    }
  }
}
