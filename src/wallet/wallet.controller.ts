// 지갑 API — GET /wallets/:address/transactions|balances|stats
import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletImportService } from './wallet-import.service';

// << bigint 는 JSON 직렬화 불가 → string 으로 변환
function serialize(obj: unknown): unknown {
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serialize);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, serialize(v)]));
  }
  return obj;
}

@Controller('wallets')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly walletImportService: WalletImportService,
  ) {}

  // API003 — GET /wallets/:address/transactions?chainId=1
  @Get(':address/transactions')
  async getTransactions(
    @Param('address') address: string,
    @Query('chainId') chainId: string,
  ) {
    const txs = await this.walletService.getTransactions(address, Number(chainId));
    return serialize(txs.map(({ logs: _logs, ...tx }) => tx)); // logs 는 내부 필드라 제외
  }

  // API004 — GET /wallets/:address/balances?chainId=1
  @Get(':address/balances')
  async getBalances(
    @Param('address') address: string,
    @Query('chainId') chainId: string,
  ) {
    const balances = await this.walletService.getBalances(address, Number(chainId));
    return serialize(balances);
  }

  // POST /wallets/:address/import?chainId=1 — Alchemy 로 과거 이력 수집
  @Post(':address/import')
  async importHistory(
    @Param('address') address: string,
    @Query('chainId') chainId: string,
  ) {
    return this.walletImportService.importHistory(address);
  }

  // API005 — GET /wallets/:address/stats?chainId=1
  @Get(':address/stats')
  async getStats(
    @Param('address') address: string,
    @Query('chainId') chainId: string,
  ) {
    const stats = await this.walletService.getStats(address, Number(chainId));
    return serialize(stats);
  }
}
