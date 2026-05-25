import { Injectable, Logger } from '@nestjs/common';
import { Parser } from '@json2csv/plainjs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { AuditAction } from '../../audit/audit-action.enum.js';
import { EmailService } from '../../notifications/email.service.js';
import { S3Service } from '../../documents/s3.service.js';

interface ExportJobData {
  tenantId: string;
  requestedBy: string;
  format: 'csv' | 'pdf';
  filters: {
    startDate?: string;
    endDate?: string;
    action?: string;
    actorId?: string;
  };
}

@Injectable()
export class AuditExportHandler {
  private readonly logger = new Logger(AuditExportHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly s3: S3Service,
  ) {}

  async run(
    data: ExportJobData,
  ): Promise<{ fileKey: string; signedUrl: string }> {
    const { tenantId, requestedBy, format, filters } = data;

    // 1. Query audit logs with filters
    const where: any = { tenantId };
    if (filters.action) where.action = filters.action;
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const rows = await this.prisma.bypassTenantScoping(async () => {
      return await this.prisma.client.auditLogEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10_000, // cap export at 10k rows
      });
    });

    // Fetch actor emails
    const actorIds = Array.from(
      new Set<string>(
        rows.filter((r: any) => r.actorId).map((r: any) => r.actorId as string),
      ),
    );
    const actors = await this.prisma.bypassTenantScoping(async () => {
      return await this.prisma.client.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true },
      });
    });
    const actorMap = new Map<string, string>(
      actors.map((a) => [a.id, a.email]),
    );

    // Load tenant name
    const tenant = await this.prisma.bypassTenantScoping(async () => {
      return await this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
    });
    const tenantName = tenant?.name ?? 'Platform';

    // Map rows with PII redaction
    const mapped = rows.map((r: any) => ({
      timestamp:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      actor_email: this.redactEmail(actorMap.get(r.actorId) ?? 'system'),
      action: r.action,
      target_type: r.targetType ?? '',
      target_id: r.targetId ?? '',
      details: r.details ? JSON.stringify(r.details) : '',
      ip: this.redactIp(r.ipAddress),
    }));

    // 2. Generate file
    let buffer: Buffer;
    let contentType: string;
    const ext = format;

    if (format === 'csv') {
      const parser = new Parser({
        fields: [
          'timestamp',
          'actor_email',
          'action',
          'target_type',
          'target_id',
          'details',
          'ip',
        ],
      });
      const csv = parser.parse(mapped);
      buffer = Buffer.from(csv, 'utf-8');
      contentType = 'text/csv';
    } else {
      buffer = await this.generatePdf(mapped, tenantName, filters);
      contentType = 'application/pdf';
    }

    // 3. Upload to S3
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileKey = `${tenantId}/exports/audit-${timestamp}.${ext}`;
    await this.s3.upload({ key: fileKey, body: buffer, contentType });

    // 4. Generate signed URL (1 hour)
    const signedUrl = await this.s3.getSignedDownloadUrl(fileKey, 3600);

    // 5. Send email to requesting user
    const user = await this.prisma.bypassTenantScoping(async () => {
      return await this.prisma.client.user.findUnique({
        where: { id: requestedBy },
        select: { email: true, fullName: true },
      });
    });

    if (user) {
      // Load branding for email (BE-013)
      const config = await this.prisma.bypassTenantScoping(async () => {
        return await this.prisma.client.tenantConfig.findUnique({
          where: { tenantId },
          select: { branding: true },
        });
      });
      const branding = config?.branding || {};

      await this.emailService.sendAuditExportReady({
        to: user.email,
        fullName: user.fullName,
        downloadUrl: signedUrl,
        format,
        rowCount: mapped.length,
        branding: {
          tenantName,
          accentColor: branding.accentColor || branding.accent || '#4F7BF7',
        },
      });
    }

    // 6. Audit the export
    await this.audit.log({
      tenantId,
      actorId: requestedBy,
      action: AuditAction.DATA_EXPORT,
      targetType: 'AuditLogEvent',
      targetId: fileKey,
      details: { format, rowCount: mapped.length, filters },
    });

    this.logger.log(
      `Audit export complete: ${mapped.length} rows, format=${format}, key=${fileKey}`,
    );

    return { fileKey, signedUrl };
  }

  private async generatePdf(
    rows: any[],
    tenantName: string,
    filters: ExportJobData['filters'],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 30,
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc
        .fontSize(16)
        .text(`${tenantName} — Audit Log Export`, { align: 'center' });
      doc.moveDown(0.5);

      // Subtitle
      const dateRange = [
        filters.startDate ? `From: ${filters.startDate}` : null,
        filters.endDate ? `To: ${filters.endDate}` : null,
      ]
        .filter(Boolean)
        .join('  |  ');
      doc
        .fontSize(9)
        .text(
          `Generated: ${new Date().toISOString()}  |  Rows: ${rows.length}${dateRange ? `  |  ${dateRange}` : ''}`,
          { align: 'center' },
        );
      doc.moveDown(1);

      // Table header
      const cols = [
        { label: 'Timestamp', width: 130 },
        { label: 'Actor', width: 120 },
        { label: 'Action', width: 140 },
        { label: 'Target Type', width: 80 },
        { label: 'Target ID', width: 120 },
        { label: 'IP', width: 80 },
      ];

      const startX = 30;
      let y = doc.y;

      doc.fontSize(8).font('Helvetica-Bold');
      cols.reduce((x, col) => {
        doc.text(col.label, x, y, { width: col.width, lineBreak: false });
        return x + col.width;
      }, startX);
      y += 14;
      doc
        .moveTo(startX, y)
        .lineTo(startX + cols.reduce((s, c) => s + c.width, 0), y)
        .stroke();
      y += 4;

      // Table rows
      doc.font('Helvetica').fontSize(7);
      for (const row of rows) {
        if (y > doc.page.height - 40) {
          doc.addPage();
          y = 30;
        }

        const values = [
          row.timestamp,
          row.actor_email,
          row.action,
          row.target_type,
          row.target_id,
          row.ip ?? '',
        ];
        cols.reduce((x, col, i) => {
          doc.text(String(values[i] ?? ''), x, y, {
            width: col.width,
            lineBreak: false,
          });
          return x + col.width;
        }, startX);
        y += 12;
      }

      doc.end();
    });
  }

  private redactEmail(email: string): string {
    if (!email || email === 'system') return 'system';
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const local = parts[0];
    const domain = parts[1];
    const visible = local.slice(0, 3);
    return `${visible}***@${domain}`;
  }

  private redactIp(ip: string | null | undefined): string {
    if (!ip) return '';
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    return ip;
  }
}
