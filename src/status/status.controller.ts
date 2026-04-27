// 상태 API — GET /status, GET /status/:chainId
import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { StatusService } from './status.service';

// << bigint 직렬화
function serialize(obj: unknown): unknown {
  if (typeof obj === 'bigint') return obj.toString();
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serialize);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, serialize(v)]));
  }
  return obj;
}

@Controller('status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  // API007 — GET /status
  @Get()
  async getAllStatus() {
    return serialize(await this.statusService.getAllStatus());
  }

  // API008 — GET /status/:chainId
  @Get(':chainId')
  async getStatusByChainId(@Param('chainId') chainId: string) {
    const status = await this.statusService.getStatusByChainId(Number(chainId));
    if (!status) throw new NotFoundException(`chainId ${chainId} not found`);
    return serialize(status);
  }
}
