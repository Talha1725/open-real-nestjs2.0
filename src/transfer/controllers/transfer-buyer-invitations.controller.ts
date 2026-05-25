import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import { TransferService } from '../transfer.service.js';
import { AcceptInvitationDto } from '../dto/accept-invitation.dto.js';

@ApiTags('Buyer - Transfer invitations')
@ApiBearerAuth('access-token')
@Roles('REGISTERED')
@Controller('buyer/transfer-invitations')
export class TransferBuyerInvitationsController {
  constructor(private readonly transferService: TransferService) {}

  @Get()
  @ApiOperation({ summary: 'List pending transfer invitations for me' })
  list(@CurrentUser() user: JwtPayload) {
    return this.transferService.listBuyerTransferInvitations(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invitation detail for me' })
  getDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.getBuyerTransferInvitationDetail(user.sub, id);
  }

  @Post(':id/accept')
  @ApiOperation({
    summary: 'Accept a transfer invitation (become buyer candidate)',
  })
  @ApiBody({ type: AcceptInvitationDto })
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.transferService.acceptTransferInvitation(
      user.tenantId,
      user.sub,
      id,
      dto.token,
    );
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline a transfer invitation' })
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferService.declineTransferInvitation(
      user.tenantId,
      user.sub,
      id,
    );
  }
}
