import { Injectable, Logger } from '@nestjs/common';
import { TransferService } from '../../transfer/transfer.service.js';

@Injectable()
export class PriorityWindowExpiryHandler {
  private readonly logger = new Logger(PriorityWindowExpiryHandler.name);

  constructor(private readonly transferService: TransferService) {}

  async run(data: {
    transferCaseId: string;
    tenantId: string;
  }): Promise<{ expired: boolean }> {
    this.logger.log(
      `Expiring priority window for transfer case ${data.transferCaseId}`,
    );

    await this.transferService.expirePriorityWindow(data.transferCaseId);

    return { expired: true };
  }
}
