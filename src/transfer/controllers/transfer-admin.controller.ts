import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AdminStateChangeThrottle } from '../../common/decorators/throttle-policy.decorator.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import { TransferService } from '../transfer.service.js';
import { QueryTransfersDto } from '../dto/query-transfers.dto.js';
import { AssignBuyerDto } from '../dto/assign-buyer.dto.js';
import { ConfirmPaymentDto } from '../dto/confirm-payment.dto.js';
import { EscalateDto } from '../dto/escalate.dto.js';
import { ResolveEscalationDto } from '../dto/resolve-escalation.dto.js';

@ApiTags('Tenant Admin - Transfers')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@Controller('admin/transfers')
export class TransferAdminController {
  constructor(private readonly transferService: TransferService) {}

  @Get()
  @ApiOperation({ summary: 'List all transfer cases (paginated, filterable)' })
  list(@Query() query: QueryTransfersDto) {
    return this.transferService.listAllTransfers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full transfer case detail with all relations' })
  getDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.transferService.getAdminTransferDetail(id);
  }

  @Post(':id/assign-buyer')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Assign a buyer to the transfer case' })
  @ApiBody({ type: AssignBuyerDto })
  assignBuyer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AssignBuyerDto,
  ) {
    return this.transferService.adminAssignBuyer(
      user.tenantId,
      user.sub,
      id,
      dto.buyerId,
    );
  }

  @Post(':id/docs-complete')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Mark documents as complete' })
  docsComplete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.adminMarkDocsComplete(
      user.tenantId,
      user.sub,
      id,
    );
  }

  @Post(':id/confirm-payment')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Confirm payment received' })
  @ApiBody({ type: ConfirmPaymentDto })
  confirmPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmPaymentDto,
  ) {
    return this.transferService.adminConfirmPayment(
      user.tenantId,
      user.sub,
      id,
      dto.paymentReference,
      dto.notes,
    );
  }

  @Post(':id/final-approve-registry')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary:
      'Final approval after payment confirmed (register update in progress)',
  })
  finalApproveRegistry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.adminFinalApproveRegistry(
      user.tenantId,
      user.sub,
      id,
    );
  }

  @Post(':id/finalize')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary: 'Finalize transfer — IRREVERSIBLE registry mutation',
  })
  @ApiResponse({
    status: 200,
    description: 'Transfer finalized and ownership transferred',
  })
  finalize(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.adminFinalizeTransfer(
      user.tenantId,
      user.sub,
      id,
    );
  }

  @Post(':id/escalate')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Escalate transfer case for compliance review' })
  @ApiBody({ type: EscalateDto })
  escalate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: EscalateDto,
  ) {
    return this.transferService.adminEscalateTransfer(
      user.tenantId,
      user.sub,
      id,
      dto.reason,
    );
  }

  @Post(':id/resolve-escalation')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Resolve an escalated transfer case' })
  @ApiBody({ type: ResolveEscalationDto })
  resolveEscalation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ResolveEscalationDto,
  ) {
    return this.transferService.adminResolveEscalation(
      user.tenantId,
      user.sub,
      id,
      dto.targetStatus,
      dto.notes,
    );
  }
}
