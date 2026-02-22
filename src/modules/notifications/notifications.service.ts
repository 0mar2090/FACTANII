import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/** Parameters for sending an invoice email with optional attachments. */
export interface SendInvoiceParams {
  to: string;
  companyName: string;
  tipoDoc: string;
  serie: string;
  correlativo: number;
  totalVenta: number;
  moneda: string;
  xmlContent?: string;
  pdfBuffer?: Buffer;
}

/** Parameters for sending an alert/notification email. */
export interface SendAlertParams {
  to: string;
  subject: string;
  message: string;
}

/** Parameters for the generic email send method. */
export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer | string }>;
}

/** Result of a send email operation. */
export interface SendEmailResult {
  id?: string;
  success: boolean;
}

/** Map of document type codes to their human-readable Spanish names. */
const TIPO_DOC_LABELS: Record<string, string> = {
  '01': 'Factura Electrónica',
  '03': 'Boleta de Venta Electrónica',
  '07': 'Nota de Crédito Electrónica',
  '08': 'Nota de Débito Electrónica',
};

/** Map of currency codes to their symbol. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  PEN: 'S/',
  USD: 'US$',
  EUR: '€',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resend: Resend;
  private readonly emailFrom: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('resend.apiKey', '');
    this.emailFrom = this.configService.get<string>(
      'resend.emailFrom',
      'facturas@facturape.com',
    );
    this.resend = new Resend(apiKey);
  }

  /**
   * Send a welcome email when a user registers.
   */
  async sendWelcome(email: string, name: string): Promise<void> {
    const subject = 'Bienvenido a FacturaPE';

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f4f4f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1a56db;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">FacturaPE</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Facturación Electrónica SUNAT</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;">¡Bienvenido, ${this.escapeHtml(name)}!</h2>
              <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
                Tu cuenta en FacturaPE ha sido creada exitosamente. Ahora puedes emitir comprobantes electrónicos
                directamente a SUNAT sin intermediarios.
              </p>
              <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
                Para comenzar a facturar, sigue estos pasos:
              </p>
              <ol style="margin:0 0 24px;padding-left:20px;color:#4b5563;font-size:15px;line-height:1.8;">
                <li>Registra tu empresa con tu RUC</li>
                <li>Sube tu certificado digital (.pfx)</li>
                <li>Configura tus credenciales SOL</li>
                <li>Emite tu primera factura</li>
              </ol>
              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                Si necesitas ayuda, no dudes en contactarnos respondiendo a este correo.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:13px;text-align:center;">
                FacturaPE &mdash; Facturación electrónica directa con SUNAT
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    await this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send an invoice email with optional XML and PDF attachments.
   */
  async sendInvoice(params: SendInvoiceParams): Promise<void> {
    const {
      to,
      companyName,
      tipoDoc,
      serie,
      correlativo,
      totalVenta,
      moneda,
      xmlContent,
      pdfBuffer,
    } = params;

    const docLabel = TIPO_DOC_LABELS[tipoDoc] || 'Comprobante Electrónico';
    const currencySymbol = CURRENCY_SYMBOLS[moneda] || moneda;
    const docNumber = `${serie}-${String(correlativo).padStart(8, '0')}`;
    const subject = `${docLabel} ${docNumber} de ${companyName}`;
    const formattedTotal = `${currencySymbol} ${totalVenta.toFixed(2)}`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f4f4f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1a56db;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">FacturaPE</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;">Facturación Electrónica SUNAT</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#1f2937;font-size:22px;">${this.escapeHtml(docLabel)}</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Emitida por ${this.escapeHtml(companyName)}</p>

              <!-- Document details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;width:40%;">
                    <span style="color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Documento</span>
                  </td>
                  <td style="padding:16px 20px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;">
                    <span style="color:#1f2937;font-size:15px;font-weight:600;">${this.escapeHtml(docNumber)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Tipo</span>
                  </td>
                  <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                    <span style="color:#1f2937;font-size:15px;">${this.escapeHtml(docLabel)}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <span style="color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Total</span>
                  </td>
                  <td style="padding:16px 20px;">
                    <span style="color:#1a56db;font-size:20px;font-weight:700;">${this.escapeHtml(formattedTotal)}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                Adjunto encontrará el comprobante electrónico en formato XML${pdfBuffer ? ' y PDF' : ''}.
                Este documento tiene validez tributaria ante SUNAT.
              </p>
              <p style="margin:0;color:#9ca3af;font-size:13px;">
                Este es un correo generado automáticamente. Si tiene consultas, comuníquese con ${this.escapeHtml(companyName)}.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:13px;text-align:center;">
                Enviado a través de FacturaPE &mdash; Facturación electrónica directa con SUNAT
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    // Build attachments
    const attachments: Array<{ filename: string; content: Buffer | string }> =
      [];

    if (xmlContent) {
      attachments.push({
        filename: `${docNumber}.xml`,
        content: xmlContent,
      });
    }

    if (pdfBuffer) {
      attachments.push({
        filename: `${docNumber}.pdf`,
        content: pdfBuffer,
      });
    }

    await this.sendEmail({
      to,
      subject,
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  }

  /**
   * Send an alert email (certificate expiry, quota warning, etc.).
   */
  async sendAlert(params: SendAlertParams): Promise<void> {
    const { to, subject, message } = params;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f4f4f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#dc2626;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">FacturaPE</h1>
              <p style="margin:8px 0 0;color:#fecaca;font-size:14px;">Alerta del Sistema</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1f2937;font-size:22px;">${this.escapeHtml(subject)}</h2>
              <div style="padding:20px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin:0 0 24px;">
                <p style="margin:0;color:#991b1b;font-size:15px;line-height:1.6;">${this.escapeHtml(message)}</p>
              </div>
              <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                Te recomendamos tomar acción lo antes posible para evitar interrupciones en el servicio de facturación.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:13px;text-align:center;">
                FacturaPE &mdash; Facturación electrónica directa con SUNAT
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    await this.sendEmail({ to, subject: `[Alerta] ${subject}`, html });
  }

  /**
   * Generic email send via Resend SDK.
   */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const { to, subject, html, attachments } = params;

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.emailFrom,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content:
            a.content instanceof Buffer
              ? a.content
              : Buffer.from(a.content),
        })),
      });

      if (error) {
        this.logger.error(
          `Failed to send email to ${Array.isArray(to) ? to.join(', ') : to}: ${error.message}`,
          { error, subject },
        );
        return { success: false };
      }

      this.logger.log(
        `Email sent successfully to ${Array.isArray(to) ? to.join(', ') : to} [id=${data?.id}]`,
        { subject },
      );

      return { id: data?.id, success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Unexpected error sending email to ${Array.isArray(to) ? to.join(', ') : to}: ${errorMessage}`,
        { subject },
      );
      return { success: false };
    }
  }

  /**
   * Escape HTML special characters to prevent XSS in email templates.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
