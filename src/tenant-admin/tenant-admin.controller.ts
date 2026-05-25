import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AdminStateChangeThrottle } from '../common/decorators/throttle-policy.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { TenantAdminService } from './tenant-admin.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUsersDto } from './dto/query-users.dto.js';

@ApiTags('Tenant Admin - Users')
@ApiBearerAuth('access-token')
@Controller('admin/users')
@Roles('ADMIN')
export class TenantAdminController {
  constructor(private readonly tenantAdminService: TenantAdminService) {}

  @Get()
  @ApiOperation({ summary: 'List users in this tenant' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['REGISTERED', 'VERIFIED', 'ISSUER', 'ADMIN'],
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'],
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiResponse({ status: 200, description: 'Paginated user list' })
  listUsers(@Query() query: QueryUsersDto) {
    return this.tenantAdminService.listUsers(query);
  }

  @Post()
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Create a user for this tenant' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  createUser(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.tenantAdminService.createUser(dto, user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user detail' })
  @ApiResponse({ status: 200, description: 'User detail with counts' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUser(@Param('id') id: string) {
    return this.tenantAdminService.getUser(id);
  }

  @Patch(':id')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Update user role, status, or profile' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tenantAdminService.updateUser(id, dto, user.sub);
  }
}
