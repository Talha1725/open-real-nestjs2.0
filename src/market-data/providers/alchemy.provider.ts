import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AlchemyTokenActivity {
  contractAddress: string;
  network: string;
  asset: string | null;
  transferCount30d: number;
  uniqueWallets30d: number;
  lastTransferAt: string | null;
}

interface AlchemyTransferResponse {
  result?: {
    transfers?: Array<{
      asset?: string;
      from?: string;
      to?: string;
      metadata?: {
        blockTimestamp?: string;
      };
    }>;
  };
}

const DEFAULT_NETWORK = 'eth-mainnet';

@Injectable()
export class AlchemyProvider {
  private readonly logger = new Logger(AlchemyProvider.name);
  private readonly apiKey: string;
  private readonly network: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ALCHEMY_API_KEY', '').trim();
    this.network =
      this.configService.get<string>('ALCHEMY_NETWORK', '').trim() ||
      DEFAULT_NETWORK;
  }

  isConfigured(contractAddress?: string | null): boolean {
    return Boolean(this.apiKey && contractAddress);
  }

  publicUrl(): string {
    return `https://${this.network}.g.alchemy.com/v2`;
  }

  async getTokenActivity(
    contractAddress: string,
  ): Promise<AlchemyTokenActivity> {
    if (!this.apiKey) {
      throw new Error('Alchemy API key is not configured');
    }

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);

    const res = await fetch(`${this.publicUrl()}/${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getAssetTransfers',
        params: [
          {
            fromBlock: '0x0',
            toBlock: 'latest',
            contractAddresses: [contractAddress],
            category: ['erc20'],
            withMetadata: true,
            excludeZeroValue: true,
            maxCount: '0x64',
            order: 'desc',
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Alchemy token activity failed: ${res.status} — ${body}`);
      throw new Error(`Alchemy API error: ${res.status} — ${body}`);
    }

    const data = (await res.json()) as AlchemyTransferResponse;
    const transfers = (data.result?.transfers ?? []).filter((transfer) => {
      const timestamp = transfer.metadata?.blockTimestamp;
      return timestamp ? new Date(timestamp) >= fromDate : true;
    });

    const uniqueWallets = new Set<string>();
    let lastTransferAt: string | null = null;

    for (const transfer of transfers) {
      if (transfer.from) uniqueWallets.add(transfer.from.toLowerCase());
      if (transfer.to) uniqueWallets.add(transfer.to.toLowerCase());
      const timestamp = transfer.metadata?.blockTimestamp ?? null;
      if (timestamp && (!lastTransferAt || timestamp > lastTransferAt)) {
        lastTransferAt = timestamp;
      }
    }

    return {
      contractAddress,
      network: this.network,
      asset: transfers[0]?.asset ?? null,
      transferCount30d: transfers.length,
      uniqueWallets30d: uniqueWallets.size,
      lastTransferAt,
    };
  }
}
