// 백필 서비스 — POST /backfill 요청을 받아 BackfillWorker 에 위임
import { Injectable } from '@nestjs/common';
import { BackfillWorker } from '../indexer/backfill-worker';

@Injectable()
export class BackfillService {
  constructor(private readonly backfillWorker: BackfillWorker) {}

  // << API006 — startBlock ~ endBlock 범위 소급 처리
  async startBackfill(startBlock: bigint, endBlock: bigint): Promise<void> {
    if (startBlock > endBlock) {
      throw new Error(`startBlock(${startBlock}) > endBlock(${endBlock})`);
    }
    await this.backfillWorker.run(startBlock, endBlock);
  }
}
