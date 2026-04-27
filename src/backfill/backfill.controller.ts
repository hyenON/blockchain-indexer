// 백필 API — POST /backfill
import { Controller, Post, Body } from '@nestjs/common';
import { BackfillService } from './backfill.service';

@Controller('backfill')
export class BackfillController {
  constructor(private readonly backfillService: BackfillService) {}

  // API006 — POST /backfill
  // body: { startBlock: "100", endBlock: "200" } (bigint 는 JSON 에서 string 으로)
  @Post()
  async startBackfill(
    @Body() body: { startBlock: string; endBlock: string },
  ) {
    await this.backfillService.startBackfill(BigInt(body.startBlock), BigInt(body.endBlock));
    return { message: 'backfill started', startBlock: body.startBlock, endBlock: body.endBlock };
  }
}
