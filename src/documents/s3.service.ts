import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY', ''),
      },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
    this.bucket = this.configService.get('AWS_S3_BUCKET', '');
  }

  async upload(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<{ key: string; size: number }> {
    if (!this.bucket) {
      throw new Error('AWS_S3_BUCKET is not configured');
    }

    // Server-side file validation (BE-011)
    this.validateFile(params.key, params.contentType);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    });
    await this.s3Client.send(command);
    return { key: params.key, size: params.body.length };
  }

  private validateFile(key: string, contentType: string) {
    const dangerousExtensions = [
      '.exe',
      '.dll',
      '.bat',
      '.sh',
      '.msi',
      '.dmg',
      '.php',
      '.js',
    ];
    const lowerKey = key.toLowerCase();
    if (dangerousExtensions.some((ext) => lowerKey.endsWith(ext))) {
      throw new Error(`File type rejected for security reasons: ${key}`);
    }

    // basic MIME check
    if (
      contentType.includes('javascript') ||
      contentType.includes('html') ||
      contentType.includes('php')
    ) {
      throw new Error(
        `MIME type rejected for security reasons: ${contentType}`,
      );
    }
  }

  async getSignedDownloadUrl(key: string, expiresIn?: number): Promise<string> {
    const configExpiry = this.configService.get<number>(
      'S3_SIGNED_URL_EXPIRY_SECONDS',
      900,
    );
    const finalExpiresIn = expiresIn ?? Number(configExpiry);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: finalExpiresIn });
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.s3Client.send(command);
  }

  buildKey(params: {
    tenantId: string;
    entityType: string;
    entityId: string;
    fileName: string;
  }): string {
    const sanitized = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uuid = randomUUID();
    return `${params.tenantId}/${params.entityType}/${params.entityId}/${uuid}-${sanitized}`;
  }
}
