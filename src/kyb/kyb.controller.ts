import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { KybService } from './kyb.service.js';
import { SubmitKybDto } from './dto/submit-kyb.dto.js';

@ApiTags('Issuer - KYB')
@ApiBearerAuth('access-token')
@Controller('issuer')
@Roles('REGISTERED')
export class KybController {
  constructor(private readonly kybService: KybService) {}

  @Post('kyb')
  @ApiOperation({ summary: 'Submit KYB application for issuer onboarding' })
  @ApiBody({ type: SubmitKybDto })
  @ApiResponse({ status: 201, description: 'KYB submitted for review' })
  @ApiResponse({ status: 409, description: 'KYB already submitted' })
  submitKyb(@Body() dto: SubmitKybDto, @CurrentUser() user: JwtPayload) {
    return this.kybService.submitKyb(dto, user.sub);
  }

  @Get('kyb/status')
  @ApiOperation({ summary: 'Get KYB application status' })
  @ApiResponse({ status: 200, description: 'KYB status' })
  getStatus(@CurrentUser() user: JwtPayload) {
    return this.kybService.getKybStatus(user.sub);
  }
}
