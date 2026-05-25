import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';
import { S3Service } from './s3.service.js';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly tenantContext: TenantContextService,
  ) {}

  async upload(params: {
    file: Express.Multer.File;
    entityType: string;
    entityId: string;
    category?: string;
    userId: string;
  }) {
    const tenantId = this.tenantContext.getTenantId()!;
    const config = this.tenantContext.getTenantConfig();

    const maxSizeMB = config?.workflows?.maxFileUploadMB ?? 10;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (!ALLOWED_TYPES.includes(params.file.mimetype)) {
      throw new BadRequestException(
        'File type not allowed. Accepted: PDF, PNG, JPG, JPEG',
      );
    }

    if (params.file.size > maxSizeBytes) {
      throw new BadRequestException(
        `File too large. Maximum size: ${maxSizeMB}MB`,
      );
    }

    // ─── Security Hardening (QA P0-003) ──────────────────────────────────────
    
    // 1. Reject multiple extensions (e.g., malicious.png.exe)
    if ((params.file.originalname.match(/\./g) || []).length > 1) {
      throw new BadRequestException(
        'Files with multiple extensions are not allowed for security reasons',
      );
    }

    // 2. Magic byte validation
    const isValidMagicByte = this.validateFileBuffer(
      params.file.buffer,
      params.file.mimetype,
    );
    if (!isValidMagicByte) {
      throw new BadRequestException(
        'File content does not match its extension (magic byte mismatch)',
      );
    }

    const key = this.s3.buildKey({
      tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      fileName: params.file.originalname,
    });

    await this.s3.upload({
      key,
      body: params.file.buffer,
      contentType: params.file.mimetype,
    });

    if (params.entityType === 'opportunity' && params.entityId) {
      const doc = await this.prisma.client.opportunityDocument.create({
        data: {
          tenantId,
          opportunityId: params.entityId,
          fileName: params.file.originalname,
          fileKey: key,
          fileSize: params.file.size,
          mimeType: params.file.mimetype,
          category: params.category || 'OTHER',
        },
      });

      return {
        id: doc.id,
        fileName: doc.fileName,
        fileKey: doc.fileKey,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        category: doc.category,
        createdAt: doc.createdAt,
      };
    }

    return {
      fileKey: key,
      fileName: params.file.originalname,
      fileSize: params.file.size,
      mimeType: params.file.mimetype,
    };
  }

  /**
   * Simple magic-byte validation for allowed types.
   */
  private validateFileBuffer(buffer: Buffer, mimetype: string): boolean {
    if (!buffer || buffer.length < 4) return false;

    const header = buffer.toString('hex', 0, 4).toUpperCase();

    switch (mimetype) {
      case 'application/pdf':
        return header === '25504446'; // %PDF
      case 'image/png':
        return header === '89504E47'; // \x89PNG
      case 'image/jpeg':
      case 'image/jpg':
        return header.startsWith('FFD8FF'); // JPEG start of image
      default:
        return false;
    }
  }

  async getSignedUrl(
    documentId: string,
  ): Promise<{ url: string; fileName: string }> {
    const tenantId = this.tenantContext.getTenantId()!;
    const doc = await this.prisma.client.opportunityDocument.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const url = await this.s3.getSignedDownloadUrl(doc.fileKey);
    return { url, fileName: doc.fileName };
  }

  async getSignedUrlByKey(fileKey: string): Promise<string> {
    return this.s3.getSignedDownloadUrl(fileKey);
  }

  async deleteDocument(documentId: string): Promise<void> {
    const tenantId = this.tenantContext.getTenantId()!;
    const doc = await this.prisma.client.opportunityDocument.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    await this.s3.delete(doc.fileKey);

    await this.prisma.client.opportunityDocument.delete({
      where: { id: documentId },
    });
  }

  async listDocuments(opportunityId: string) {
    return await this.prisma.client.opportunityDocument.findMany({
      where: { opportunityId },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        category: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
