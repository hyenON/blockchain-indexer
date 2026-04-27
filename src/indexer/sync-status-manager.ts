// 동기화 상태 관리 — last_synced_block 추적, 장애 복구 시 재개 지점 결정
// 시퀀스 다이어그램 #1 의 updateLastSyncedBlock() 호출에 대응
// Repository 에 의존 (IRepository 인터페이스만 알고, 구현체는 모름)
import { Injectable, Inject } from '@nestjs/common';
import type { IRepository } from '../domain/repository.interface';
import { IndexerStatus, SyncStatus } from '../domain/types';

@Injectable()
export class SyncStatusManager {
  constructor(@Inject('IRepository') private readonly repo: IRepository) {}

  // << 시퀀스 다이어그램 #1 의 마지막 단계 — 블록 처리 완료 후 진행도 저장
  async updateLastSyncedBlock(chainId: number, blockNumber: bigint): Promise<void> {
    await this.repo.updateSyncStatus(chainId, blockNumber, 'SYNCING');
  }

  // << T-14/T-15: 재시작 시 여기서 읽어서 마지막 블록부터 이어서 시작
  async getCurrentStatus(chainId: number): Promise<SyncStatus | null> {
    return this.repo.getSyncStatus(chainId);
  }

  // << T-09/T-12: RPC 끊김, DB 오류 등 에러 발생 시 상태 기록
  async recordError(chainId: number, errorMessage: string): Promise<void> {
    const current = await this.repo.getSyncStatus(chainId);
    const lastSyncedBlock = current?.lastSyncedBlock ?? 0n;
    await this.repo.updateSyncStatus(chainId, lastSyncedBlock, 'ERROR', errorMessage);
  }

  // << 인덱서 상태 전이 (state-machine.md 인덱서 상태 머신 참고)
  async transitionTo(chainId: number, status: IndexerStatus): Promise<void> {
    const current = await this.repo.getSyncStatus(chainId);
    const lastSyncedBlock = current?.lastSyncedBlock ?? 0n;
    await this.repo.updateSyncStatus(chainId, lastSyncedBlock, status);
  }
}
