import { Body, Controller, Get, Patch, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ExactRoles, Roles } from '../common/decorators/roles.decorator.js';
import { AuthSensitiveThrottle } from '../common/decorators/throttle-policy.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { MfaActionDto } from './dto/update-mfa.dto.js';
import { UpdateBankDetailsDto } from './dto/update-bank-details.dto.js';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Roles('REGISTERED')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile returned' })
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @Patch('me')
  @Roles('REGISTERED')
  @ApiOperation({ summary: 'Update profile (name, phone)' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Get('me/verification')
  @Roles('REGISTERED')
  @ApiOperation({ summary: 'Get KYC verification status' })
  @ApiResponse({ status: 200, description: 'Verification status returned' })
  getVerification(@CurrentUser() user: JwtPayload) {
    return this.usersService.getVerificationStatus(user.sub);
  }

  @Post('me/verification/initiate')
  @ExactRoles('REGISTERED')
  @ApiOperation({ summary: 'Start KYC verification process' })
  @ApiResponse({
    status: 200,
    description: 'KYC session created (mock in MVP)',
  })
  initiateVerification(@CurrentUser() user: JwtPayload) {
    return this.usersService.initiateVerification(user.sub);
  }

  @Post('me/verification/sumsub/refresh')
  @ExactRoles('REGISTERED')
  @ApiOperation({ summary: 'Refresh Sumsub WebSDK access token' })
  @ApiResponse({
    status: 200,
    description: 'Refreshed Sumsub WebSDK access token',
  })
  refreshSumsubVerification(@CurrentUser() user: JwtPayload) {
    return this.usersService.refreshSumsubVerification(user.sub);
  }

  @Get('me/bank-details')
  @Roles('VERIFIED')
  @ApiOperation({ summary: 'Get bank details (VERIFIED role required)' })
  @ApiResponse({ status: 200, description: 'Bank details or null' })
  async getBankDetails(@CurrentUser() user: JwtPayload) {
    const bankDetails = await this.usersService.getBankDetails(user.sub);
    return { data: bankDetails };
  }

  @Put('me/bank-details')
  @Roles('VERIFIED')
  @ApiOperation({ summary: 'Create or update bank details' })
  @ApiBody({ type: UpdateBankDetailsDto })
  @ApiResponse({ status: 200, description: 'Bank details saved' })
  updateBankDetails(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateBankDetailsDto,
  ) {
    return this.usersService.updateBankDetails(user.sub, dto);
  }

  @Patch('me/password')
  @AuthSensitiveThrottle()
  @Roles('REGISTERED')
  @ApiOperation({ summary: 'Change password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed' })
  @ApiResponse({ status: 401, description: 'Current password incorrect' })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.sub, dto);
  }

  @Put('me/mfa')
  @Roles('REGISTERED')
  @ApiOperation({ summary: 'Setup, enable, or disable MFA' })
  @ApiBody({ type: MfaActionDto })
  @ApiResponse({ status: 200, description: 'MFA action completed' })
  handleMfa(@CurrentUser() user: JwtPayload, @Body() dto: MfaActionDto) {
    return this.usersService.handleMfaAction(user.sub, dto);
  }
}
