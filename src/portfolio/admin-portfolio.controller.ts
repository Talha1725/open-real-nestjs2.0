import {
  BadRequestException,
  Body,
  Controller,
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
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { PortfolioService } from './portfolio.service.js';
import { CreateDistributionDto } from './dto/create-distribution.dto.js';

@ApiTags('Tenant Admin - Portfolio')
@ApiBearerAuth('access-token')
@Controller('admin/holdings')
@Roles('ADMIN')
export class AdminPortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post(':id/distributions')
  @ApiOperation({ summary: 'Record a distribution for a holding' })
  @ApiBody({ type: CreateDistributionDto })
  @ApiResponse({ status: 201, description: 'Distribution recorded' })
  @ApiResponse({ status: 404, description: 'Holding not found' })
  createDistribution(
    @Param('id') id: string,
    @Body() dto: CreateDistributionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.portfolioService.createDistribution(id, dto, user.sub);
  }

  @Post(':id/statements')
  @ApiOperation({ summary: 'Upload a statement document for a holding' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: {
          type: 'string',
          enum: ['PERIODIC', 'TAX', 'CONFIRMATION'],
        },
        periodStart: { type: 'string', example: '2026-01-01' },
        periodEnd: { type: 'string', example: '2026-03-31' },
      },
      required: ['file', 'type'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      storage: memoryStorage(),
    }),
  )
  @ApiResponse({ status: 201, description: 'Statement uploaded' })
  @ApiResponse({ status: 404, description: 'Holding not found' })
  uploadStatement(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
    @Body('periodStart') periodStart: string,
    @Body('periodEnd') periodEnd: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.portfolioService.uploadStatement(
      id,
      file,
      { type, periodStart, periodEnd },
      user.sub,
    );
  }
}
