// 블록 처리 핵심 클래스 — 시퀀스 다이어그램 #1 의 모든 단계를 실행
// RateLimiter → EventDecoder → Repository → SyncStatusManager 순서로 호출
// 실패 시 최대 3회 재시도, 초과 시 해당 블록 skip (T-13)
import { Injectable, Inject } from '@nestjs/common';
import { IRepository } from '../domain/repository.interface';
import { Block, Transaction } from '../domain/types';
import { EventDecoder } from './event-decoder';
import { RateLimiter } from './rate-limiter';
import { SyncStatusManager } from './sync-status-manager';

const MAX_RETRY = 3;

@Injectable()
export class BlockProcessor {
  // 블록별 재시도 횟수 추적 (T-13)
  private retryCount = new Map<string, number>();

  constructor(
    @Inject('IRepository') private readonly repo: IRepository,
    private readonly rateLimiter: RateLimiter,
    private readonly eventDecoder: EventDecoder,
    private readonly syncStatusManager: SyncStatusManager,
  ) {}

  // << 시퀀스 다이어그램 #1 의 onBlock(block) 에 대응
  // BlockListener 가 호출, transactions 는 BlockListener 가 receipt 포함해서 전달
  async process(block: Block, transactions: Transaction[]): Promise<void> {
    const blockKey = `${block.number}-${block.chainId}`;

    try {
      // #3 RateLimiter 토큰 요청
      await this.rateLimiter.requestToken();

      // #6 Transfer 이벤트 디코딩
      const { tokenTransfers, rawLogs } = this.eventDecoder.decodeEvents(transactions);

      // #8 블록 저장
      await this.repo.saveBlock(block);

      // #9 트랜잭션 저장
      await this.repo.saveTransactions(transactions);

      // #10 token_transfers + logs 저장
      await this.repo.saveTokenTransfers(tokenTransfers);
      await this.repo.saveLogs(rawLogs);

      // #11 sync_status 업데이트
      await this.syncStatusManager.updateLastSyncedBlock(block.chainId, block.number);

      // 성공 시 재시도 카운트 초기화
      this.retryCount.delete(blockKey);

      // reorg 감지
      await this.checkReorg(block);
    } catch (e) {
      await this.handleFailure(block, transactions, blockKey, e);
    }
  }

  // << reorg 감지 — 이전 블록 hash 와 현재 블록 parentHash 비교 (flow-diagram.md 참고)
  private async checkReorg(block: Block): Promise<void> {
    const prev = await this.repo.findBlock(block.number - 1n, block.chainId);
    if (prev && block.parentHash !== prev.hash) {
      await this.repo.markReorged(block.number - 1n, block.chainId);
    }
  }

  // << T-13: 실패 시 재시도 or skip
  private async handleFailure(
    block: Block,
    transactions: Transaction[],
    blockKey: string,
    error: unknown,
  ): Promise<void> {
    const retries = this.retryCount.get(blockKey) ?? 0;

    if (retries < MAX_RETRY) {
      this.retryCount.set(blockKey, retries + 1);
      return this.process(block, transactions);
    }

    // 3회 초과 → skip + ERROR 기록
    this.retryCount.delete(blockKey);
    const message = error instanceof Error ? error.message : 'Unknown error';
    await this.syncStatusManager.recordError(
      block.chainId,
      `Block ${block.number} skipped after ${MAX_RETRY} retries: ${message}`,
    );
  }
}
