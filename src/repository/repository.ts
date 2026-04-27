// Prisma 를 사용해 IRepository 를 구현하는 구현체 — DB 접근의 실제 담당자
// Service 는 IRepository 인터페이스만 알고, 이 클래스의 존재를 모름 (DIP 원칙)
// 도메인 타입(bigint) ↔ Prisma 타입(Decimal, BigInt) 변환도 여기서 처리
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IRepository } from '../domain/repository.interface';
import {
  Block,
  Chain,
  IndexerStatus,
  RawLog,
  SyncStatus,
  TokenTransfer,
  Transaction,
} from '../domain/types';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaRepository implements IRepository {
  constructor(private readonly prisma: PrismaService) {}

  // << 블록

  async saveBlock(block: Block): Promise<void> {
    // upsert: 같은 (number, chainId) 가 이미 있으면 UPDATE, 없으면 INSERT
    // → T-02 중복 블록 시나리오를 DB 레벨에서 막아줌
    await this.prisma.block.upsert({
      where: { number_chainId: { number: block.number, chainId: block.chainId } },
      create: {
        number: block.number,
        chainId: block.chainId,
        hash: block.hash,
        parentHash: block.parentHash,
        timestamp: block.timestamp,
        gasUsed: block.gasUsed,
        gasLimit: block.gasLimit,
        baseFeePerGas: block.baseFeePerGas ?? 0n, // EIP-1559 이전 체인은 null → 0 으로 저장
        isReorged: block.isReorged,
      },
      update: {
        // reorg 발생 시 같은 번호 블록이 다른 hash 로 들어올 수 있어서 hash 도 업데이트
        hash: block.hash,
        parentHash: block.parentHash,
        isReorged: block.isReorged,
      },
    });
  }

  async saveTransactions(transactions: Transaction[]): Promise<void> {
    // createMany + skipDuplicates: 한 번에 여러 건 INSERT, 이미 있는 hash 는 무시
    // value 는 wei 단위 bigint → Prisma Decimal(78,0) 으로 변환 필요
    await this.prisma.transaction.createMany({
      data: transactions.map((tx) => ({
        hash: tx.hash,
        chainId: tx.chainId,
        blockNumber: tx.blockNumber,
        blockHash: tx.blockHash,
        fromAddress: tx.fromAddress,
        toAddress: tx.toAddress,
        value: new Prisma.Decimal(tx.value.toString()), // bigint → Decimal 변환
        gas: tx.gas,
        input: tx.input,
        nonce: tx.nonce,
        transactionIndex: tx.transactionIndex,
        status: tx.status,
        // logs 는 DB 컬럼이 아닌 처리 중 임시 필드라 여기선 제외
      })),
      skipDuplicates: true,
    });
  }

  async saveTokenTransfers(tokenTransfers: TokenTransfer[]): Promise<void> {
    // amount 도 wei 단위 bigint → Decimal 변환
    await this.prisma.tokenTransfer.createMany({
      data: tokenTransfers.map((t) => ({
        chainId: t.chainId,
        txHash: t.txHash,
        blockNumber: t.blockNumber,
        contractAddress: t.contractAddress,
        fromAddress: t.fromAddress,
        toAddress: t.toAddress,
        amount: new Prisma.Decimal(t.amount.toString()), // bigint → Decimal 변환
        logIndex: t.logIndex,
      })),
      skipDuplicates: true,
    });
  }

  async saveLogs(logs: RawLog[]): Promise<void> {
    // T-11: Transfer 디코딩 실패한 raw 로그를 logs 테이블에 그대로 저장
    await this.prisma.log.createMany({
      data: logs.map((l) => ({
        chainId: l.chainId,
        txHash: l.txHash,
        blockNumber: l.blockNumber,
        contractAddress: l.contractAddress,
        topic0: l.topic0,
        data: l.data,
        logIndex: l.logIndex,
      })),
      skipDuplicates: true,
    });
  }

  async findBlock(blockNumber: bigint, chainId: number): Promise<Block | null> {
    // reorg 감지 시 이전 블록의 hash 를 꺼내 비교하기 위해 사용
    const row = await this.prisma.block.findUnique({
      where: { number_chainId: { number: blockNumber, chainId } },
    });
    if (!row) return null;
    return {
      number: row.number,
      chainId: row.chainId,
      hash: row.hash,
      parentHash: row.parentHash,
      timestamp: row.timestamp,
      gasUsed: row.gasUsed,
      gasLimit: row.gasLimit,
      baseFeePerGas: row.baseFeePerGas,
      isReorged: row.isReorged,
    };
  }

  async markReorged(blockNumber: bigint, chainId: number): Promise<void> {
    // T-16: reorg 감지 시 해당 블록을 is_reorged = true 로 마킹
    await this.prisma.block.update({
      where: { number_chainId: { number: blockNumber, chainId } },
      data: { isReorged: true },
    });
  }

  // << 지갑 조회 (시퀀스 다이어그램 #2)

  async findTransactionsByAddress(address: string, chainId: number): Promise<Transaction[]> {
    // OR 조건: 보낸 사람(from) 이거나 받은 사람(to) 이면 모두 조회
    const rows = await this.prisma.transaction.findMany({
      where: {
        chainId,
        OR: [{ fromAddress: address }, { toAddress: address }],
      },
    });
    return rows.map((row) => ({
      hash: row.hash,
      chainId: row.chainId,
      blockNumber: row.blockNumber,
      blockHash: row.blockHash,
      fromAddress: row.fromAddress,
      toAddress: row.toAddress,
      value: BigInt(row.value.toFixed(0)), // Decimal → bigint 변환 (지수표기법 방지)
      gas: row.gas,
      input: row.input,
      nonce: row.nonce,
      transactionIndex: row.transactionIndex,
      status: row.status,
      logs: [], // 조회 시에는 logs 가 필요 없으므로 빈 배열
    }));
  }

  async findTokenTransfers(address: string, chainId: number): Promise<TokenTransfer[]> {
    const rows = await this.prisma.tokenTransfer.findMany({
      where: {
        chainId,
        OR: [{ fromAddress: address }, { toAddress: address }],
      },
    });
    return rows.map((row) => ({
      chainId: row.chainId,
      txHash: row.txHash,
      blockNumber: row.blockNumber,
      contractAddress: row.contractAddress,
      fromAddress: row.fromAddress,
      toAddress: row.toAddress,
      amount: BigInt(row.amount.toFixed(0)), // Decimal → bigint 변환 (지수표기법 방지)
      logIndex: row.logIndex,
    }));
  }

  async getTopContracts(
    address: string,
    chainId: number,
  ): Promise<{ contractAddress: string; count: number }[]> {
    // token_transfers 기반 집계 — import 된 데이터에서 가장 많이 거래한 컨트랙트 TOP 10
    const result = await this.prisma.tokenTransfer.groupBy({
      by: ['contractAddress'],
      where: {
        chainId,
        OR: [{ fromAddress: address }, { toAddress: address }],
      },
      _count: { contractAddress: true },
      orderBy: { _count: { contractAddress: 'desc' } },
      take: 10,
    });
    return result.map((r) => ({
      contractAddress: r.contractAddress,
      count: r._count.contractAddress,
    }));
  }

  async getFirstTransaction(address: string, chainId: number): Promise<Transaction | null> {
    // 블록 번호 오름차순으로 첫 번째 트랜잭션 조회 → 지갑 최초 활동 날짜 계산에 사용
    const row = await this.prisma.transaction.findFirst({
      where: {
        chainId,
        OR: [{ fromAddress: address }, { toAddress: address }],
      },
      orderBy: { blockNumber: 'asc' },
    });
    if (!row) return null;
    return {
      hash: row.hash,
      chainId: row.chainId,
      blockNumber: row.blockNumber,
      blockHash: row.blockHash,
      fromAddress: row.fromAddress,
      toAddress: row.toAddress,
      value: BigInt(row.value.toFixed(0)),
      gas: row.gas,
      input: row.input,
      nonce: row.nonce,
      transactionIndex: row.transactionIndex,
      status: row.status,
      logs: [],
    };
  }

  // << sync_status

  async getSyncStatus(chainId: number): Promise<SyncStatus | null> {
    // T-14/T-15: 재시작 시 마지막으로 동기화된 블록 번호를 여기서 읽어서 이어서 시작
    const row = await this.prisma.syncStatus.findFirst({ where: { chainId } });
    if (!row) return null;
    return {
      chainId: row.chainId,
      lastSyncedBlock: row.lastSyncedBlock,
      status: row.status as IndexerStatus,
      errorMessage: row.errorMessage ?? undefined,
      updatedAt: row.updatedAt,
    };
  }

  async updateSyncStatus(
    chainId: number,
    lastSyncedBlock: bigint,
    status: IndexerStatus,
    errorMessage?: string,
  ): Promise<void> {
    // sync_status 는 체인당 1건 유지 — 있으면 UPDATE, 없으면 INSERT
    // Prisma upsert 는 unique 컬럼 기준이라 chainId 에 unique 가 없으면 이 방식 사용
    const existing = await this.prisma.syncStatus.findFirst({ where: { chainId } });
    if (existing) {
      await this.prisma.syncStatus.update({
        where: { id: existing.id },
        data: { lastSyncedBlock, status, errorMessage: errorMessage ?? null },
      });
    } else {
      await this.prisma.syncStatus.create({
        data: { chainId, lastSyncedBlock, status, errorMessage },
      });
    }
  }

  async findAllSyncStatus(): Promise<SyncStatus[]> {
    const rows = await this.prisma.syncStatus.findMany();
    return rows.map((row) => ({
      chainId: row.chainId,
      lastSyncedBlock: row.lastSyncedBlock,
      status: row.status as IndexerStatus,
      errorMessage: row.errorMessage ?? undefined,
      updatedAt: row.updatedAt,
    }));
  }

  // << 체인

  async findChain(chainId: number): Promise<Chain | null> {
    const row = await this.prisma.chain.findUnique({ where: { chainId } });
    if (!row) return null;
    return { chainId: row.chainId, name: row.name, finalityDepth: row.finalityDepth };
  }

  async findAllChains(): Promise<Chain[]> {
    const rows = await this.prisma.chain.findMany();
    return rows.map((row) => ({ chainId: row.chainId, name: row.name, finalityDepth: row.finalityDepth }));
  }

  async saveChain(chain: Chain): Promise<void> {
    await this.prisma.chain.upsert({
      where: { chainId: chain.chainId },
      create: { chainId: chain.chainId, name: chain.name, finalityDepth: chain.finalityDepth },
      update: { name: chain.name, finalityDepth: chain.finalityDepth },
    });
  }
}
