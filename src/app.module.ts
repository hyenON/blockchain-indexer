// DI 조립 — 모든 클래스의 의존성을 여기서 연결
// IRepository 토큰으로 PrismaRepository 를 주입, Viem 클라이언트는 useFactory 로 생성
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { createPublicClient, http } from 'viem';

import { PrismaService } from './repository/prisma.service';
import { PrismaRepository } from './repository/repository';

import { EventDecoder } from './indexer/event-decoder';
import { RateLimiter } from './indexer/rate-limiter';
import { SyncStatusManager } from './indexer/sync-status-manager';
import { BlockProcessor } from './indexer/block-processor';
import { BlockListener } from './indexer/block-listener';
import { BackfillWorker } from './indexer/backfill-worker';

import { WalletService } from './wallet/wallet.service';
import { WalletController } from './wallet/wallet.controller';

import { ChainService } from './chain/chain.service';
import { ChainController } from './chain/chain.controller';

import { BackfillService } from './backfill/backfill.service';
import { BackfillController } from './backfill/backfill.controller';

import { StatusService } from './status/status.service';
import { StatusController } from './status/status.controller';

// << Viem 공용 클라이언트 생성 — RPC_URL, CHAIN_ID 는 .env 에서 읽음
function createViemClient() {
  return createPublicClient({
    transport: http(process.env.RPC_URL ?? 'http://localhost:8545'),
  });
}

@Module({
  controllers: [WalletController, ChainController, BackfillController, StatusController],
  providers: [
    PrismaService,

    // << IRepository 토큰 — Service 들은 이 토큰으로 PrismaRepository 를 받음
    { provide: 'IRepository', useClass: PrismaRepository },

    EventDecoder,
    RateLimiter,
    SyncStatusManager,
    BlockProcessor,

    // << BlockListener — Viem 클라이언트와 chainId 는 env 에서 읽어서 주입
    {
      provide: BlockListener,
      useFactory: (blockProcessor: BlockProcessor) => {
        const chainId = Number(process.env.CHAIN_ID ?? 1);
        return new BlockListener(blockProcessor, createViemClient() as any, chainId);
      },
      inject: [BlockProcessor],
    },

    // << BackfillWorker — BlockListener 와 같은 클라이언트 사용
    {
      provide: BackfillWorker,
      useFactory: (blockProcessor: BlockProcessor) => {
        const chainId = Number(process.env.CHAIN_ID ?? 1);
        return new BackfillWorker(blockProcessor, createViemClient() as any, chainId);
      },
      inject: [BlockProcessor],
    },

    WalletService,
    ChainService,
    BackfillService,
    StatusService,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly blockListener: BlockListener) {}

  // << 앱 시작 시 블록 구독 자동 시작
  onApplicationBootstrap() {
    this.blockListener.start();
  }
}
