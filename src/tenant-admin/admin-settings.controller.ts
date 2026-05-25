import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
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
import { AdminStateChangeThrottle } from '../common/decorators/throttle-policy.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { TenantAdminService } from './tenant-admin.service.js';
import { UpdateBrandingDto } from './dto/update-branding.dto.js';
import { UpdateLegalDto } from './dto/update-legal.dto.js';
import { UpdateSupportDto } from './dto/update-support.dto.js';
import { UpdateIntegrationsDto } from './dto/update-integrations.dto.js';
import { UpdateWorkflowsDto } from './dto/update-workflows.dto.js';

@ApiTags('Tenant Admin - Settings')
@ApiBearerAuth('access-token')
@Controller('admin/settings')
@Roles('ADMIN')
export class AdminSettingsController {
  constructor(private readonly service: TenantAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tenant settings' })
  @ApiResponse({ status: 200, description: 'All tenant config sections' })
  getSettings() {
    return this.service.getSettings();
  }

  @Patch('branding')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Update branding (colors, fonts)' })
  @ApiBody({ type: UpdateBrandingDto })
  @ApiResponse({ status: 200, description: 'Updated branding config' })
  updateBranding(
    @Body() dto: UpdateBrandingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateBranding(dto, user.sub);
  }

  @Post('branding/logo')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Upload a tenant logo (primary, monochrome, or favicon)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: {
          type: 'string',
          enum: ['primary', 'monochrome', 'favicon'],
          example: 'primary',
        },
      },
      required: ['file', 'type'],
    },
  })
  @ApiResponse({ status: 201, description: 'Logo uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid file type or logo type' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.uploadLogo(file, type, user.sub);
  }

  @Patch('legal')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Update legal content (terms, privacy, notices)' })
  @ApiBody({ type: UpdateLegalDto })
  @ApiResponse({ status: 200, description: 'Updated legal config' })
  updateLegal(@Body() dto: UpdateLegalDto, @CurrentUser() user: JwtPayload) {
    return this.service.updateLegal(dto, user.sub);
  }

  @Patch('support')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Update support contact info' })
  @ApiBody({ type: UpdateSupportDto })
  @ApiResponse({ status: 200, description: 'Updated support config' })
  updateSupport(
    @Body() dto: UpdateSupportDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateSupport(dto, user.sub);
  }

  @Patch('integrations')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary: 'Update integration settings (KYC provider, payment config)',
  })
  @ApiBody({ type: UpdateIntegrationsDto })
  @ApiResponse({ status: 200, description: 'Updated integrations config' })
  updateIntegrations(
    @Body() dto: UpdateIntegrationsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateIntegrations(dto, user.sub);
  }

  @Patch('workflows')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary:
      'Update workflow settings (expiry, acknowledgements, allowed values)',
  })
  @ApiBody({ type: UpdateWorkflowsDto })
  @ApiResponse({ status: 200, description: 'Updated workflows config' })
  updateWorkflows(
    @Body() dto: UpdateWorkflowsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateWorkflows(dto, user.sub);
  }
}
