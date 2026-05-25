import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { DocumentsService } from './documents.service.js';

@ApiTags('Documents')
@ApiBearerAuth('access-token')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @Roles('REGISTERED')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      storage: memoryStorage(),
    }),
  )
  @ApiOperation({ summary: 'Upload a file to tenant-prefixed S3 storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        entityType: {
          type: 'string',
          enum: ['opportunity', 'kyb', 'general'],
          example: 'opportunity',
        },
        entityId: { type: 'string', example: 'uuid-of-entity' },
        category: {
          type: 'string',
          enum: ['PROSPECTUS', 'FACT_SHEET', 'LEGAL', 'FINANCIAL', 'OTHER'],
          example: 'PROSPECTUS',
        },
      },
      required: ['file', 'entityType', 'entityId'],
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('entityType') entityType: string,
    @Body('entityId') entityId: string,
    @Body('category') category: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!entityType || !entityId) {
      throw new BadRequestException('entityType and entityId are required');
    }
    return this.documentsService.upload({
      file,
      entityType,
      entityId,
      category,
      userId: user.sub,
    });
  }

  @Get(':id/url')
  @Roles('REGISTERED')
  @ApiOperation({
    summary: 'Get a signed download URL for a document (15 min expiry)',
  })
  @ApiResponse({ status: 200, description: 'Signed URL returned' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getSignedUrl(@Param('id') id: string) {
    return this.documentsService.getSignedUrl(id);
  }
}
