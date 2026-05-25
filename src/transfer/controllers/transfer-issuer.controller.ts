import {
  Controller,
  Get,
  Post,
  Patch,
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
import { IssuerApproveDto } from '../dto/issuer-approve.dto.js';
import { AssignBuyerDto } from '../dto/assign-buyer.dto.js';
import { ConfirmPaymentDto } from '../dto/confirm-payment.dto.js';
import { EscalateDto } from '../dto/escalate.dto.js';
import { IssuerCancelTransferDto } from '../dto/issuer-cancel-transfer.dto.js';
import { IssuerRejectTransferDto } from '../dto/issuer-reject-transfer.dto.js';
import { RequestDocumentsDto } from '../dto/request-documents.dto.js';
import { InviteBuyerDto } from '../dto/invite-buyer.dto.js';
import { UpdateTransferCaseMetaDto } from '../dto/update-transfer-case-meta.dto.js';
import { RelaunchPriorityNoticesDto } from '../dto/relaunch-priority-notices.dto.js';
import { RejectChecklistItemDto } from '../dto/reject-checklist-item.dto.js';

@ApiTags('Issuer - Transfers')
@ApiBearerAuth('access-token')
@Roles('ISSUER')
@Controller('issuer/transfers')
export class TransferIssuerController {
  constructor(private readonly transferService: TransferService) {}

  @Get()
  @ApiOperation({ summary: 'List transfer cases for my opportunities' })
  list(@CurrentUser() user: JwtPayload, @Query() query: QueryTransfersDto) {
    return this.transferService.listIssuerTransfers(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer case detail' })
  getDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.getIssuerTransferDetail(id, user.sub);
  }

  @Post(':id/approve')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'SPV manager approval for transfer' })
  @ApiBody({ type: IssuerApproveDto })
  @ApiResponse({ status: 200, description: 'Transfer approved by issuer' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: IssuerApproveDto,
  ) {
    return this.transferService.issuerApproveTransfer(
      user.tenantId,
      user.sub,
      id,
      dto.rofrEnabled,
    );
  }

  @Post(':id/assign-buyer')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Select/assign buyer for the transfer case' })
  @ApiBody({ type: AssignBuyerDto })
  assignBuyer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AssignBuyerDto,
  ) {
    return this.transferService.issuerAssignBuyer(
      user.tenantId,
      user.sub,
      id,
      dto.buyerId,
    );
  }

  @Post(':id/docs-complete')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Mark documents as complete (issuer)' })
  docsComplete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.issuerMarkDocsComplete(
      user.tenantId,
      user.sub,
      id,
    );
  }

  @Post(':id/confirm-payment')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Confirm payment received (issuer)' })
  @ApiBody({ type: ConfirmPaymentDto })
  confirmPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmPaymentDto,
  ) {
    return this.transferService.issuerConfirmPayment(
      user.tenantId,
      user.sub,
      id,
      dto.paymentReference,
      dto.notes,
    );
  }

  @Post(':id/finalize-register')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary:
      'Finalize register update — IRREVERSIBLE registry mutation (issuer)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transfer finalized and ownership transferred',
  })
  finalizeRegister(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.issuerFinalizeTransfer(
      user.tenantId,
      user.sub,
      id,
    );
  }

  @Post(':id/escalate')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary: 'Escalate transfer case for compliance review (issuer)',
  })
  @ApiBody({ type: EscalateDto })
  escalate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: EscalateDto,
  ) {
    return this.transferService.issuerEscalateTransfer(
      user.tenantId,
      user.sub,
      id,
      dto.reason,
    );
  }

  @Post(':id/cancel')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Cancel transfer case (issuer)' })
  @ApiBody({ type: IssuerCancelTransferDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: IssuerCancelTransferDto,
  ) {
    return this.transferService.issuerCancelTransfer(
      user.tenantId,
      user.sub,
      id,
      dto.reason,
    );
  }

  @Post(':id/reject')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Reject transfer case (issuer)' })
  @ApiBody({ type: IssuerRejectTransferDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: IssuerRejectTransferDto,
  ) {
    return this.transferService.issuerRejectTransfer(
      user.tenantId,
      user.sub,
      id,
      dto.reason,
    );
  }

  @Post(':id/open-priority-window')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary: 'Open ROFR / priority window (from manager review)',
  })
  openPriorityWindow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.issuerOpenPriorityWindow(
      user.tenantId,
      user.sub,
      id,
    );
  }

  @Post(':id/relaunch-priority-notices')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary: 'Extend window and (re)issue missing priority notices',
  })
  @ApiBody({ type: RelaunchPriorityNoticesDto })
  relaunchPriorityNotices(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RelaunchPriorityNoticesDto,
  ) {
    return this.transferService.issuerRelaunchPriorityNotices(
      user.tenantId,
      user.sub,
      id,
      dto.extendDays,
    );
  }

  @Post(':id/request-documents')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary: 'Request compliance / transfer documents (checklist)',
  })
  @ApiBody({ type: RequestDocumentsDto })
  requestDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RequestDocumentsDto,
  ) {
    return this.transferService.issuerRequestDocuments(
      user.tenantId,
      user.sub,
      id,
      dto.items,
    );
  }

  @Post(':id/invite-buyer')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Invite buyer by email (KYC-ready, no buyer yet)' })
  @ApiBody({ type: InviteBuyerDto })
  inviteBuyer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteBuyerDto,
  ) {
    return this.transferService.issuerInviteBuyer(user.tenantId, user.sub, id, {
      email: dto.email,
      invitedUserId: dto.invitedUserId,
      message: dto.message,
      expiresInDays: dto.expiresInDays,
    });
  }

  @Patch(':id/meta')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary: 'Update queue metadata (due date, internal assignee)',
  })
  @ApiBody({ type: UpdateTransferCaseMetaDto })
  updateMeta(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTransferCaseMetaDto,
  ) {
    return this.transferService.issuerUpdateCaseMeta(
      user.tenantId,
      user.sub,
      id,
      {
        dueAt: dto.dueAt,
        assignedToUserId: dto.assignedToUserId,
      },
    );
  }

  @Post(':id/confirm-buyer-kyc')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary: 'Confirm buyer KYC is complete (moves to compliance review)',
  })
  confirmBuyerKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.issuerConfirmBuyerKycReady(
      user.tenantId,
      user.sub,
      id,
    );
  }

  @Post(':id/checklist-items/:itemId/approve')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Approve a checklist item' })
  approveChecklistItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.issuerApproveChecklistItem(
      user.tenantId,
      user.sub,
      id,
      itemId,
    );
  }

  @Post(':id/checklist-items/:itemId/reject')
  @AdminStateChangeThrottle()
  @ApiOperation({ summary: 'Reject a checklist item' })
  @ApiBody({ type: RejectChecklistItemDto })
  rejectChecklistItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RejectChecklistItemDto,
  ) {
    return this.transferService.issuerRejectChecklistItem(
      user.tenantId,
      user.sub,
      id,
      itemId,
      dto.reason,
    );
  }

  @Post(':id/final-approve-registry')
  @AdminStateChangeThrottle()
  @ApiOperation({
    summary:
      'Issuer final approval after payment confirmed (moves to register update in progress)',
  })
  finalApproveRegistry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.issuerFinalApproveRegistry(
      user.tenantId,
      user.sub,
      id,
    );
  }
}
