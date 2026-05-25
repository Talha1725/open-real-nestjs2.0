import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RequireFeature } from '../common/decorators/require-feature.decorator.js';
import { FeatureFlagGuard } from '../common/guards/feature-flag.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { IssuerService } from './issuer.service.js';
import { CreateOpportunityDto } from './dto/create-opportunity.dto.js';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto.js';
import { UpdateIssuerProfileDto } from './dto/update-issuer-profile.dto.js';
import { QueryIssuerOpportunitiesDto } from './dto/query-issuer-opportunities.dto.js';

@ApiTags('Issuer Portal')
@ApiBearerAuth('access-token')
@Roles('ISSUER')
@RequireFeature('issuer_portal')
@UseGuards(FeatureFlagGuard)
@Controller('issuer')
export class IssuerController {
  constructor(private readonly issuerService: IssuerService) {}

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({
    summary: 'Issuer dashboard with org info and opportunity counts',
  })
  @ApiResponse({ status: 200, description: 'Dashboard data' })
  getDashboard(@CurrentUser() user: JwtPayload) {
    return this.issuerService.getDashboard(user.sub);
  }

  // ─── Opportunities ──────────────────────────────────────────────────────────

  @Get('opportunities')
  @ApiOperation({ summary: 'List issuer opportunities with status filter' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated opportunity list' })
  listOpportunities(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryIssuerOpportunitiesDto,
  ) {
    return this.issuerService.listOpportunities(user.sub, query);
  }

  @Post('opportunities')
  @ApiOperation({ summary: 'Create a new draft opportunity' })
  @ApiBody({ type: CreateOpportunityDto })
  @ApiResponse({ status: 201, description: 'Draft opportunity created' })
  createOpportunity(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOpportunityDto,
  ) {
    return this.issuerService.createOpportunity(user.sub, dto);
  }

  @Get('opportunities/:id')
  @ApiOperation({ summary: 'Get opportunity detail with documents' })
  @ApiResponse({ status: 200, description: 'Full opportunity detail' })
  @ApiResponse({ status: 404, description: 'Opportunity not found' })
  getOpportunity(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.issuerService.getOpportunity(user.sub, id);
  }

  @Patch('opportunities/:id')
  @ApiOperation({ summary: 'Update draft or rejected opportunity' })
  @ApiBody({ type: UpdateOpportunityDto })
  @ApiResponse({ status: 200, description: 'Opportunity updated' })
  @ApiResponse({
    status: 400,
    description: 'Cannot edit non-draft opportunity',
  })
  updateOpportunity(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    return this.issuerService.updateOpportunity(user.sub, id, dto);
  }

  // ─── Cap Table ─────────────────────────────────────────────────────────────

  @Get('opportunities/:id/cap-table')
  @ApiOperation({ summary: 'View cap table for an opportunity' })
  @ApiResponse({ status: 200, description: 'Cap table with holders' })
  @ApiResponse({ status: 404, description: 'Opportunity not found' })
  getCapTable(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.issuerService.getCapTable(user.sub, id);
  }

  // ─── Documents ──────────────────────────────────────────────────────────────

  @Post('opportunities/:id/documents')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Upload document to opportunity' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        category: {
          type: 'string',
          enum: ['PROSPECTUS', 'FACT_SHEET', 'LEGAL', 'FINANCIAL', 'OTHER'],
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Document uploaded' })
  @ApiResponse({
    status: 400,
    description: 'Cannot upload to non-draft opportunity',
  })
  uploadDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category?: string,
  ) {
    return this.issuerService.uploadDocument(user.sub, id, file, category);
  }

  @Delete('opportunities/:id/documents/:documentId')
  @ApiOperation({ summary: 'Delete document from draft opportunity' })
  @ApiResponse({ status: 200, description: 'Document deleted' })
  @ApiResponse({ status: 400, description: 'Can only delete from DRAFT' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  deleteDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.issuerService.deleteDocument(user.sub, id, documentId);
  }

  // ─── Hero Image ─────────────────────────────────────────────────────────────

  @Post('opportunities/:id/hero-image')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Upload or replace hero image' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Hero image uploaded' })
  @ApiResponse({
    status: 400,
    description: 'Invalid image type or non-editable status',
  })
  uploadHeroImage(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.issuerService.uploadHeroImage(user.sub, id, file);
  }

  // ─── Submit for Review ──────────────────────────────────────────────────────

  @Post('opportunities/:id/submit')
  @ApiOperation({ summary: 'Submit opportunity for admin review' })
  @ApiResponse({ status: 200, description: 'Opportunity submitted' })
  @ApiResponse({
    status: 400,
    description: 'Missing required fields or wrong status',
  })
  submitForReview(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.issuerService.submitForReview(user.sub, id);
  }

  // ─── Profile ────────────────────────────────────────────────────────────────

  @Get('profile')
  @ApiOperation({ summary: 'Get issuer organisation profile' })
  @ApiResponse({ status: 200, description: 'Issuer org profile' })
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.issuerService.getProfile(user.sub);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update issuer organisation profile' })
  @ApiBody({ type: UpdateIssuerProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateIssuerProfileDto,
  ) {
    return this.issuerService.updateProfile(user.sub, dto);
  }
}
