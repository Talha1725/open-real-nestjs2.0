import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { DashboardReadThrottle } from '../common/decorators/throttle-policy.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { InvestorHomeService } from './investor-home.service.js';

@ApiTags('Investor Home')
@ApiBearerAuth('access-token')
@Controller('investor')
export class InvestorHomeController {
  constructor(private readonly investorHomeService: InvestorHomeService) {}

  @Get('home')
  @DashboardReadThrottle()
  @Roles('REGISTERED')
  @ApiOperation({ summary: 'Personalized investor dashboard' })
  @ApiResponse({
    status: 200,
    description:
      'Dashboard adapted to user verification state with portfolio summary and featured opportunities',
  })
  getHome(@CurrentUser() user: JwtPayload) {
    return this.investorHomeService.getHome(user.sub, user.role);
  }
}
