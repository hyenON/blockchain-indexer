// RPC 요청 속도 제한 — 토큰 버킷 방식으로 실시간/백필 quota 를 분리해서 관리
// 실시간이 백필보다 항상 우선순위 높음 (flow-diagram.md RateLimiter 우선순위 참고)
import { Injectable } from '@nestjs/common';

// << 설정값
const MAX_REQUESTS_PER_SECOND = 10; // 초당 최대 요청 수 (Alchemy 기본 300 CU/s 기준 여유있게)
const REALTIME_QUOTA = 7;           // 실시간용 토큰 (전체의 70%)
const BACKFILL_QUOTA = 3;           // 백필용 토큰 (전체의 30%)
const REFILL_INTERVAL_MS = 1000;    // 1초마다 토큰 충전

@Injectable()
export class RateLimiter {
  private realtimeTokens = REALTIME_QUOTA;
  private backfillTokens = BACKFILL_QUOTA;
  private lastRefillTime = Date.now();

  // << 실시간 블록 처리용 토큰 요청 (BlockProcessor 가 호출)
  // 토큰이 없으면 충전될 때까지 대기
  async requestToken(): Promise<void> {
    await this.refillIfNeeded();

    if (this.realtimeTokens > 0) {
      this.realtimeTokens--;
      return;
    }

    // 토큰 소진 시 대기 후 재시도 (T-10)
    await this.waitForRefill();
    return this.requestToken();
  }

  // << 백필용 토큰 요청 (BackfillWorker 가 호출)
  // 실시간 토큰이 부족하면 백필을 일시 중단
  async requestTokenForBackfill(): Promise<void> {
    await this.refillIfNeeded();

    // 실시간 토큰이 절반 이하로 남으면 백필 일시 중단 (실시간 우선)
    if (this.realtimeTokens < REALTIME_QUOTA / 2) {
      await this.waitForRefill();
      return this.requestTokenForBackfill();
    }

    if (this.backfillTokens > 0) {
      this.backfillTokens--;
      return;
    }

    await this.waitForRefill();
    return this.requestTokenForBackfill();
  }

  // << 1초가 지났으면 토큰 충전
  private async refillIfNeeded(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;

    if (elapsed >= REFILL_INTERVAL_MS) {
      this.realtimeTokens = REALTIME_QUOTA;
      this.backfillTokens = BACKFILL_QUOTA;
      this.lastRefillTime = now;
    }
  }

  // << 다음 충전 시점까지 대기
  private async waitForRefill(): Promise<void> {
    const now = Date.now();
    const waitMs = REFILL_INTERVAL_MS - (now - this.lastRefillTime);
    await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 0)));
  }
}
