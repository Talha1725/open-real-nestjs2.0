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
import { ExactRoles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import { TransferService } from '../transfer.service.js';
import { CreateTransferRequestDto } from '../dto/create-transfer-request.dto.js';
import { QueryTransfersDto } from '../dto/query-transfers.dto.js';
import { InviteBuyerDto } from '../dto/invite-buyer.dto.js';

@ApiTags('Transfers')
@ApiBearerAuth('access-token')
@ExactRoles('VERIFIED')
@Controller('transfers')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  @Post('request')
  @ApiOperation({ summary: 'Create a transfer request for a holding' })
  @ApiBody({ type: CreateTransferRequestDto })
  @ApiResponse({ status: 201, description: 'Transfer request created' })
  createRequest(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTransferRequestDto,
  ) {
    return this.transferService.createTransferRequest(
      user.tenantId,
      user.sub,
      dto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List my transfers (as seller)' })
  listMyTransfers(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryTransfersDto,
  ) {
    return this.transferService.listMyTransfers(user.sub, query);
  }

  @Get('priority-notices/mine')
  @ApiOperation({ summary: 'List ROFR priority notices for me' })
  getMyPriorityNotices(@CurrentUser() user: JwtPayload) {
    return this.transferService.getMyPriorityNotices(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transfer case detail' })
  getDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.getTransferDetail(id, user.sub);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a transfer request' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.cancelTransfer(id, user.sub);
  }

  @Post(':id/invite-buyer')
  @ApiOperation({
    summary:
      'Invite a buyer by email (seller, KYC-ready gate, no buyer on case yet)',
  })
  @ApiBody({ type: InviteBuyerDto })
  inviteBuyer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteBuyerDto,
  ) {
    return this.transferService.sellerInviteBuyer(user.tenantId, user.sub, id, {
      email: dto.email,
      invitedUserId: dto.invitedUserId,
      message: dto.message,
      expiresInDays: dto.expiresInDays,
    });
  }

  @Post('priority-notices/:noticeId/exercise')
  @ApiOperation({ summary: 'Exercise ROFR priority right' })
  exercisePriority(
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.exercisePriorityNotice(
      user.tenantId,
      user.sub,
      noticeId,
    );
  }

  @Post('priority-notices/:noticeId/waive')
  @ApiOperation({ summary: 'Waive ROFR priority right' })
  waivePriority(
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.waivePriorityNotice(
      user.tenantId,
      user.sub,
      noticeId,
    );
  }
}
