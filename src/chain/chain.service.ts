// 체인 관리 서비스 — 지원 체인 목록 조회 및 추가
import { Injectable, Inject } from '@nestjs/common';
import { IRepository } from '../domain/repository.interface';
import { Chain } from '../domain/types';

@Injectable()
export class ChainService {
  constructor(@Inject('IRepository') private readonly repo: IRepository) {}

  // << API001 — 지원 체인 목록 전체 조회
  async getAllChains(): Promise<Chain[]> {
    return this.repo.findAllChains();
  }

  // << API002 — 새 체인 추가 (같은 chainId 면 upsert)
  async addChain(chainId: number, name: string, finalityDepth: number): Promise<Chain> {
    const chain: Chain = { chainId, name, finalityDepth };
    await this.repo.saveChain(chain);
    return chain;
  }
}
