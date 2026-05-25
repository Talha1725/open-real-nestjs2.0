import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DuneQuerySnapshot {
  queryId: string;
  executionId: string | null;
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  lastUpdated: string | null;
}

interface DuneQueryResponse {
  execution_id?: string;
  execution_ended_at?: string;
  submitted_at?: string;
  result?: {
    metadata?: {
      column_names?: string[];
      row_count?: number;
    };
    rows?: Record<string, unknown>[];
  };
}

const BASE_URL = 'https://api.dune.com/api/v1';

@Injectable()
export class DuneProvider {
  private readonly logger = new Logger(DuneProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('DUNE_API_KEY', '').trim();
    this.baseUrl =
      this.configService.get<string>('DUNE_API_BASE_URL', '').trim() || BASE_URL;
  }

  isConfigured(queryId?: string | null): boolean {
    return Boolean(this.apiKey && queryId);
  }

  publicUrl(): string {
    return this.baseUrl;
  }

  async getLatestQueryResult(queryId: string): Promise<DuneQuerySnapshot> {
    const data = await this.request<DuneQueryResponse>(`/query/${queryId}/results`);
    const rows = Array.isArray(data.result?.rows) ? data.result.rows : [];
    const columns = Array.isArray(data.result?.metadata?.column_names)
      ? data.result?.metadata?.column_names
      : rows[0]
        ? Object.keys(rows[0])
        : [];

    return {
      queryId,
      executionId: data.execution_id ?? null,
      rows: rows.slice(0, 25),
      columns,
      rowCount: data.result?.metadata?.row_count ?? rows.length,
      lastUpdated: data.execution_ended_at ?? data.submitted_at ?? null,
    };
  }

  private async request<T>(path: string): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Dune API key is not configured');
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Dune-Api-Key': this.apiKey,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Dune ${path} failed: ${res.status} — ${body}`);
      throw new Error(`Dune API error: ${res.status} — ${body}`);
    }

    return (await res.json()) as T;
  }
}
