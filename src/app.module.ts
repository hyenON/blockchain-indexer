// DI 조립 — 모든 클래스의 의존성을 여기서 연결
// IRepository 토큰으로 PrismaRepository 를 주입, Viem 클라이언트는 useFactory 로 생성
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { createPublicClient, http } from 'viem';
import { IRepository } from './domain/repository.interface';

import { PrismaService } from './repository/prisma.service';
import { PrismaRepository } from './repository/repository';

import { EventDecoder } from './indexer/event-decoder';
import { RateLimiter } from './indexer/rate-limiter';
import { SyncStatusManager } from './indexer/sync-status-manager';
import { BlockProcessor } from './indexer/block-processor';
import { BlockListener } from './indexer/block-listener';
import { BackfillWorker } from './indexer/backfill-worker';

import { WalletService } from './wallet/wallet.service';
import { WalletImportService } from './wallet/wallet-import.service';
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
    // << WalletImportService — Alchemy 클라이언트와 chainId 는 env 에서 주입
    {
      provide: WalletImportService,
      useFactory: (repo: IRepository) => {
        const chainId = Number(process.env.CHAIN_ID ?? 1);
        const alchemyClient = {
          async getAssetTransfers(params: any) {
            const baseUrl = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
            const body = {
              jsonrpc: '2.0',
              id: 1,
              method: 'alchemy_getAssetTransfers',
              params: [{ ...params, withMetadata: false, maxCount: '0x3e8' }],
            };
            const res = await fetch(baseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            const json = await res.json() as any;
            return json.result;
          },
        };
        return new WalletImportService(alchemyClient, repo, chainId);
      },
      inject: ['IRepository'],
    },
    ChainService,
    BackfillService,
    StatusService,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly blockListener: BlockListener) {}

  // << watchBlocks 는 주소 중심 설계로 전환 전까지 비활성화
  // 실시간 구독은 Alchemy Webhook 으로 대체 예정
  onApplicationBootstrap() {
    // this.blockListener.start();
  }
}
