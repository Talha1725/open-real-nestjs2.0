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
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { SupportService } from './support.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { QueryTicketsDto } from './dto/query-tickets.dto.js';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('faq')
  @Public()
  @ApiOperation({ summary: 'Get FAQ content (public)' })
  @ApiResponse({ status: 200, description: 'List of FAQ articles' })
  getFaq() {
    return this.supportService.getFaq();
  }

  @Post('tickets')
  @ApiBearerAuth('access-token')
  @Roles('REGISTERED')
  @ApiOperation({ summary: 'Create a support ticket' })
  @ApiBody({ type: CreateTicketDto })
  @ApiResponse({ status: 201, description: 'Ticket created' })
  createTicket(@Body() dto: CreateTicketDto, @CurrentUser() user: JwtPayload) {
    return this.supportService.createTicket(dto, user.sub);
  }

  @Get('tickets')
  @ApiBearerAuth('access-token')
  @Roles('REGISTERED')
  @ApiOperation({ summary: 'List my support tickets' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, description: 'Paginated ticket list' })
  listMyTickets(
    @Query() query: QueryTicketsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.supportService.listMyTickets(user.sub, query);
  }

  @Get('tickets/:id')
  @ApiBearerAuth('access-token')
  @Roles('REGISTERED')
  @ApiOperation({ summary: 'Get support ticket detail' })
  @ApiResponse({ status: 200, description: 'Ticket detail' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  getTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.supportService.getTicket(id, user.sub);
  }
}
