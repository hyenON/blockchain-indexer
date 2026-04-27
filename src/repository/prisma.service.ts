// Spring 의 DataSource 설정과 동일한 역할
// PrismaClient 를 상속해서 NestJS 의 DI 컨테이너에 등록할 수 있게 만든 래퍼 클래스
// — onModuleInit: NestJS 앱 시작 시 DB 연결 ($connect)
// — onModuleDestroy: NestJS 앱 종료 시 DB 연결 해제 ($disconnect)
// 이 클래스 덕분에 PrismaRepository 에서 this.prisma.block.findMany() 같은 코드 사용 가능
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
