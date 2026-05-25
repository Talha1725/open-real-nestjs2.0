import { Module } from '@nestjs/common';
import { IssuerService } from './issuer.service.js';
import { IssuerController } from './issuer.controller.js';

@Module({
  controllers: [IssuerController],
  providers: [IssuerService],
  exports: [IssuerService],
})
export class IssuerModule {}
