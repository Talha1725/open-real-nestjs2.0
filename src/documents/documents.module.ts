import { Global, Module } from '@nestjs/common';
import { DocumentsService } from './documents.service.js';
import { DocumentsController } from './documents.controller.js';
import { S3Service } from './s3.service.js';

@Global()
@Module({
  controllers: [DocumentsController],
  providers: [S3Service, DocumentsService],
  exports: [S3Service, DocumentsService],
})
export class DocumentsModule {}
