import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { TenantContextService } from '../common/tenant-context/tenant-context.service.js';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {
    const port = Number(this.configService.get('SMTP_PORT', 587));
    const secure = this.configService.get('SMTP_SECURE')
      ? this.configService.get('SMTP_SECURE') === 'true'
      : port === 465;

    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST', 'smtp.gmail.com'),
      port,
      secure,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    let fromName = this.configService.get('SMTP_FROM_NAME', 'OpenReal');
    let fromEmail = this.configService.get('SMTP_FROM_EMAIL');

    try {
      const config = this.tenantContext.getTenantConfig();
      if (config?.email) {
        const emailConfig = config.email;
        if (emailConfig.fromName) fromName = emailConfig.fromName;
        if (emailConfig.fromAddress) fromEmail = emailConfig.fromAddress;
      }
    } catch {
      // No tenant context — use defaults
    }

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      this.logger.log(`Sent "${params.subject}" to ${params.to}`);
    } catch (error: any) {
      this.logger.error(`Failed to send to ${params.to}: ${error.message}`);
      // Email delivery should not break core user flows (register/reset/etc).
      // We log the error and continue; ops can monitor and retry externally.
    }
  }

  // ─── Template Methods ─────────────────────────────

  async sendEmailVerification(params: {
    to: string;
    fullName: string;
    token: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();
    const verificationLink = this.buildLink(
      `/auth/verify-email?token=${params.token}`,
    );

    await this.sendEmail({
      to: params.to,
      subject: `Verify your email — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Welcome, ${this.escapeHtml(params.fullName)}!</h2>
          <p>Thanks for registering on ${tenantName}. Please verify your email address to get started.</p>
          <a href="${verificationLink}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Verify Email</a>
          <p style="margin-top:16px;font-size:13px;color:#888;">If the button doesn't work, copy and paste this link:<br>${verificationLink}</p>
          <p style="margin-top:16px;font-size:13px;color:#888;">This link expires in 24 hours.</p>
        `,
      }),
    });
  }

  async sendPasswordReset(params: {
    to: string;
    fullName: string;
    token: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();
    const resetLink = this.buildLink(
      `/auth/reset-password?token=${params.token}`,
    );

    await this.sendEmail({
      to: params.to,
      subject: `Reset your password — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Password Reset</h2>
          <p>Hi ${this.escapeHtml(params.fullName)}, we received a request to reset your password on ${tenantName}.</p>
          <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Reset Password</a>
          <p style="margin-top:16px;font-size:13px;color:#888;">If you didn't request this, you can safely ignore this email.</p>
          <p style="margin-top:16px;font-size:13px;color:#888;">This link expires in 1 hour.</p>
        `,
      }),
    });
  }

  async sendWelcomeVerified(params: {
    to: string;
    fullName: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();
    const loginLink = this.buildLink('/auth/login');

    await this.sendEmail({
      to: params.to,
      subject: `Email verified — Welcome to ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>You're all set, ${this.escapeHtml(params.fullName)}!</h2>
          <p>Your email has been verified. You can now access your ${tenantName} account.</p>
          <a href="${loginLink}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Go to Dashboard</a>
        `,
      }),
    });
  }

  async sendPasswordChanged(params: {
    to: string;
    fullName: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();

    await this.sendEmail({
      to: params.to,
      subject: `Password changed — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Password Updated</h2>
          <p>Hi ${this.escapeHtml(params.fullName)}, your password on ${tenantName} has been successfully changed.</p>
          <p>If you did not make this change, please contact support immediately.</p>
        `,
      }),
    });
  }

  async sendAccountCreatedByAdmin(params: {
    to: string;
    fullName: string;
    tempPassword: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();
    const loginLink = this.buildLink('/auth/login');

    await this.sendEmail({
      to: params.to,
      subject: `Your account on ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Welcome to ${tenantName}, ${this.escapeHtml(params.fullName)}!</h2>
          <p>An account has been created for you. Here are your login details:</p>
          <p><strong>Email:</strong> ${this.escapeHtml(params.to)}<br>
          <strong>Temporary Password:</strong> ${this.escapeHtml(params.tempPassword)}</p>
          <p>Please change your password after your first login.</p>
          <a href="${loginLink}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Login Now</a>
        `,
      }),
    });
  }

  async sendKycApproved(params: {
    to: string;
    fullName: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();
    const dashboardLink = this.buildLink('/dashboard');

    await this.sendEmail({
      to: params.to,
      subject: `Verification Approved — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Verification Approved</h2>
          <p>Hi ${this.escapeHtml(params.fullName)}, your identity has been verified on ${tenantName}.</p>
          <p>You now have full access to browse and invest in opportunities.</p>
          <a href="${dashboardLink}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Go to Dashboard</a>
        `,
      }),
    });
  }

  async sendKycRejected(params: {
    to: string;
    fullName: string;
    reason: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();

    await this.sendEmail({
      to: params.to,
      subject: `Verification Update — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Verification Update</h2>
          <p>Hi ${this.escapeHtml(params.fullName)}, your verification on ${tenantName} was not approved.</p>
          <p><strong>Reason:</strong> ${this.escapeHtml(params.reason)}</p>
          <p>You can resubmit your verification at any time.</p>
        `,
      }),
    });
  }

  async sendKybApproved(params: {
    to: string;
    fullName: string;
    orgName: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();
    const dashboardLink = this.buildLink('/issuer/dashboard');

    await this.sendEmail({
      to: params.to,
      subject: `Issuer Application Approved — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Application Approved</h2>
          <p>Hi ${this.escapeHtml(params.fullName)}, your issuer application for <strong>${this.escapeHtml(params.orgName)}</strong> has been approved on ${tenantName}.</p>
          <p>You can now create and submit investment opportunities.</p>
          <a href="${dashboardLink}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Go to Issuer Portal</a>
        `,
      }),
    });
  }

  async sendKybRejected(params: {
    to: string;
    fullName: string;
    orgName: string;
    reason: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();

    await this.sendEmail({
      to: params.to,
      subject: `Issuer Application Update — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Application Update</h2>
          <p>Hi ${this.escapeHtml(params.fullName)}, your issuer application for <strong>${this.escapeHtml(params.orgName)}</strong> on ${tenantName} was not approved.</p>
          <p><strong>Reason:</strong> ${this.escapeHtml(params.reason)}</p>
          <p>You can resubmit your application after addressing the feedback.</p>
        `,
      }),
    });
  }

  async sendOpportunityApproved(params: {
    to: string;
    fullName: string;
    opportunityTitle: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();
    const dashboardLink = this.buildLink('/issuer/dashboard');

    await this.sendEmail({
      to: params.to,
      subject: `Opportunity Approved — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Opportunity Approved</h2>
          <p>Hi ${this.escapeHtml(params.fullName)}, your opportunity <strong>${this.escapeHtml(params.opportunityTitle)}</strong> has been approved and is now live on ${tenantName}.</p>
          <p>Investors can now view and invest in your opportunity.</p>
          <a href="${dashboardLink}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Go to Issuer Portal</a>
        `,
      }),
    });
  }

  async sendOpportunityRejected(params: {
    to: string;
    fullName: string;
    opportunityTitle: string;
    feedback: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();

    await this.sendEmail({
      to: params.to,
      subject: `Opportunity Rejected — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Opportunity Rejected</h2>
          <p>Hi ${this.escapeHtml(params.fullName)}, your opportunity <strong>${this.escapeHtml(params.opportunityTitle)}</strong> on ${tenantName} has been rejected.</p>
          <p><strong>Reason:</strong> ${this.escapeHtml(params.feedback)}</p>
          <p>If you have any questions, please contact the platform administrator.</p>
        `,
      }),
    });
  }

  async sendOpportunityChangesRequested(params: {
    to: string;
    fullName: string;
    opportunityTitle: string;
    feedback: string;
  }): Promise<void> {
    const { tenantName, accentColor } = this.getTenantBranding();
    const dashboardLink = this.buildLink('/issuer/dashboard');

    await this.sendEmail({
      to: params.to,
      subject: `Opportunity Review: Changes Requested — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Changes Requested</h2>
          <p>Hi ${this.escapeHtml(params.fullName)}, your opportunity <strong>${this.escapeHtml(params.opportunityTitle)}</strong> on ${tenantName} requires some changes before it can be approved.</p>
          <p><strong>Feedback from Admin:</strong> ${this.escapeHtml(params.feedback)}</p>
          <p>You can edit and resubmit your opportunity from the issuer portal.</p>
          <a href="${dashboardLink}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Go to Issuer Portal</a>
        `,
      }),
    });
  }

  async sendInvestmentRequestExpired(params: {
    to: string;
    fullName: string;
    referenceNumber: string;
    opportunityTitle: string;
    amount: number;
    currency: string;
    expiryDate: Date;
    branding: {
      tenantName: string;
      accentColor: string;
      domain: string;
      fromName: string;
      fromAddress: string | null;
    };
  }): Promise<void> {
    const { branding } = params;
    const formattedAmount = `${params.currency} ${params.amount.toLocaleString()}`;
    const formattedExpiry = params.expiryDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const html = this.wrapInTemplate({
      tenantName: branding.tenantName,
      accentColor: branding.accentColor,
      body: `
        <h2>Investment Request Expired</h2>
        <p>Hi ${this.escapeHtml(params.fullName)},</p>
        <p>Your investment request <strong>${this.escapeHtml(
          params.referenceNumber,
        )}</strong> for <strong>${this.escapeHtml(
          params.opportunityTitle,
        )}</strong> has expired.</p>
        
        <div style="background:#f8f9fa;padding:16px;border-radius:6px;margin:16px 0;">
          <p style="margin:0;"><strong>Amount:</strong> ${this.escapeHtml(
            formattedAmount,
          )}</p>
          <p style="margin:8px 0 0 0;"><strong>Expired On:</strong> ${this.escapeHtml(
            formattedExpiry,
          )}</p>
        </div>

        <p>If you are still interested in this opportunity, you can submit a new request from the platform.</p>
      `,
    });

    const fromEmail =
      branding.fromAddress ??
      this.configService.get('SMTP_FROM_EMAIL', 'noreply@openreal.io');

    try {
      await this.transporter.sendMail({
        from: `"${branding.fromName}" <${fromEmail}>`,
        to: params.to,
        subject: `Investment Request Expired — ${branding.tenantName}`,
        html,
      });
      this.logger.log(
        `Sent expiry notification for ${params.referenceNumber} to ${params.to}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send expiry email to ${params.to}: ${error.message}`,
      );
      throw error;
    }
  }

  // ─── Helpers ─────────────────────────────────

  private getTenantBranding(): { tenantName: string; accentColor: string } {
    let tenantName = 'OpenReal';
    let accentColor = '#4F7BF7';
    try {
      const config = this.tenantContext.getTenantConfig();
      const tenant = this.tenantContext.getTenant();
      if (tenant?.name) tenantName = tenant.name;
      if (config?.branding) {
        const branding = config.branding;
        if (branding.accentColor || branding.accent) {
          accentColor = branding.accentColor || branding.accent;
        }
      }
    } catch {
      // No tenant context — use defaults
    }
    return { tenantName, accentColor };
  }

  async sendAuditExportReady(params: {
    to: string;
    fullName: string;
    downloadUrl: string;
    format: 'csv' | 'pdf';
    rowCount: number;
    branding?: {
      tenantName: string;
      accentColor: string;
    };
  }): Promise<void> {
    const tenantName =
      params.branding?.tenantName ?? this.getTenantBranding().tenantName;
    const accentColor =
      params.branding?.accentColor ?? this.getTenantBranding().accentColor;

    await this.sendEmail({
      to: params.to,
      subject: `Audit Log Export Ready — ${tenantName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Your Export is Ready</h2>
          <p>Hi ${this.escapeHtml(params.fullName)}, your ${params.format.toUpperCase()} audit log export from ${tenantName} is ready for download.</p>
          <p><strong>Rows:</strong> ${params.rowCount}</p>
          <a href="${this.escapeHtml(params.downloadUrl)}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Download Export</a>
          <p style="margin-top:16px;font-size:13px;color:#888;">This link expires in 1 hour.</p>
        `,
      }),
    });
  }

  async sendSystemJobFailureAlert(params: {
    to: string;
    queue: string;
    jobName: string;
    jobId: string;
    attemptsMade: number;
    failedReason: string;
    payload?: unknown;
  }): Promise<void> {
    const tenantName = 'OpenReal Platform';
    const accentColor = '#C2410C';

    await this.sendEmail({
      to: params.to,
      subject: `Job Failure Alert — ${params.jobName}`,
      html: this.wrapInTemplate({
        tenantName,
        accentColor,
        body: `
          <h2>Background Job Failed</h2>
          <p>A BullMQ job has failed and was moved to the dead-letter queue.</p>
          <p><strong>Queue:</strong> ${this.escapeHtml(params.queue)}</p>
          <p><strong>Job Name:</strong> ${this.escapeHtml(params.jobName)}</p>
          <p><strong>Job ID:</strong> ${this.escapeHtml(params.jobId)}</p>
          <p><strong>Attempts Made:</strong> ${params.attemptsMade}</p>
          <p><strong>Failure Reason:</strong> ${this.escapeHtml(params.failedReason)}</p>
          <p><strong>Payload:</strong></p>
          <pre style="white-space:pre-wrap;background:#f8f9fa;padding:12px;border-radius:6px;font-size:12px;">${this.escapeHtml(
            JSON.stringify(params.payload ?? {}, null, 2),
          )}</pre>
        `,
      }),
    });
  }

  private buildLink(path: string): string {
    let baseUrl = 'http://localhost:4000';
    try {
      const tenant = this.tenantContext.getTenant();
      if (tenant?.domain) {
        if (tenant.domain === 'localhost' || tenant.domain === '127.0.0.1') {
          baseUrl = 'http://localhost:4000';
        } else {
          baseUrl = `https://${tenant.domain}`;
        }
      }
    } catch {
      // No tenant context — use local dev fallback
    }
    return `${baseUrl}${path}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private wrapInTemplate(params: {
    tenantName: string;
    accentColor: string;
    body: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                  <td style="background:${params.accentColor};padding:24px 32px;">
                    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${params.tenantName}</h1>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:32px;">
                    ${params.body}
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding:16px 32px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">
                    &copy; ${new Date().getFullYear()} ${params.tenantName}. All rights reserved.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }
}
