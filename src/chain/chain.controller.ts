// 체인 API — GET /chains, POST /chains
import { Controller, Get, Post, Body } from '@nestjs/common';
import { ChainService } from './chain.service';

@Controller('chains')
export class ChainController {
  constructor(private readonly chainService: ChainService) {}

  // API001 — GET /chains
  @Get()
  async getAllChains() {
    return this.chainService.getAllChains();
  }

  // API002 — POST /chains
  // body: { chainId: number, name: string, finalityDepth: number }
  @Post()
  async addChain(
    @Body() body: { chainId: number; name: string; finalityDepth: number },
  ) {
    return this.chainService.addChain(body.chainId, body.name, body.finalityDepth);
  }
}
