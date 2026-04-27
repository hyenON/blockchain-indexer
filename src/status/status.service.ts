// 인덱서 상태 조회 서비스 — sync_status 테이블 기반
import { Injectable, Inject } from '@nestjs/common';
import type { IRepository } from '../domain/repository.interface';
import { SyncStatus } from '../domain/types';

@Injectable()
export class StatusService {
  constructor(@Inject('IRepository') private readonly repo: IRepository) {}

  // << API007 — 전체 체인 sync_status 조회
  async getAllStatus(): Promise<SyncStatus[]> {
    return this.repo.findAllSyncStatus();
  }

  // << API008 — 특정 체인 sync_status 조회 (없으면 null)
  async getStatusByChainId(chainId: number): Promise<SyncStatus | null> {
    return this.repo.getSyncStatus(chainId);
  }
}
