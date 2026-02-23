import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as soap from 'soap';
import axios from 'axios';
import { SUNAT_ENDPOINTS } from '../../common/constants/index.js';
import type {
  SunatSendResult,
  SunatStatusResult,
  SunatEndpoints,
} from './interfaces/index.js';

/**
 * SUNAT SOAP client for electronic invoicing (SEE - Del Contribuyente).
 *
 * Wraps the three core SOAP operations exposed by SUNAT:
 *
 * - `sendBill`    - Synchronous: sends an invoice/boleta/note and receives CDR immediately.
 * - `sendSummary` - Asynchronous: sends a daily summary or voided document and receives a ticket.
 * - `getStatus`   - Polls the status of an async operation using its ticket number.
 *
 * All methods accept explicit credentials so the caller (invoices service, queue processor)
 * can pass either real company SOL credentials or beta test credentials.
 */
@Injectable()
export class SunatClientService {
  private readonly logger = new Logger(SunatClientService.name);

  constructor(private readonly configService: ConfigService) {}

  // ───────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────

  /**
   * Send a signed ZIP to SUNAT via the synchronous `sendBill` SOAP operation.
   *
   * Used for: Facturas (01), Boletas (03), Notas de Credito (07), Notas de Debito (08).
   *
   * SUNAT responds immediately with a CDR ZIP (Constancia de Recepcion) embedded
   * in the SOAP response as a base64 `applicationResponse`.
   *
   * @param zipBuffer   - The ZIP containing the signed XML document
   * @param zipFileName - SUNAT-mandated format: `{RUC}-{TIPO}-{SERIE}-{CORRELATIVO}.zip`
   * @param ruc         - Company RUC (11 digits)
   * @param solUser     - SOL username (e.g., "MODDATOS" for beta)
   * @param solPass     - SOL password
   * @param isBeta      - `true` for beta/testing environment, `false` for production
   */
  async sendBill(
    zipBuffer: Buffer,
    zipFileName: string,
    ruc: string,
    solUser: string,
    solPass: string,
    isBeta: boolean,
  ): Promise<SunatSendResult> {
    const endpoints = this.resolveEndpoints(isBeta);
    const wsdlUrl = endpoints.invoice;
    const soapUser = `${ruc}${solUser}`;

    this.logger.log(
      `sendBill: file=${zipFileName}, ruc=${ruc}, env=${isBeta ? 'beta' : 'prod'}, endpoint=${wsdlUrl}`,
    );

    try {
      const client = await this.createSoapClient(wsdlUrl, soapUser, solPass);

      const [result] = await client.sendBillAsync({
        fileName: zipFileName,
        contentFile: zipBuffer.toString('base64'),
      });

      // SUNAT returns the CDR as base64 in applicationResponse
      const applicationResponse = result?.applicationResponse;

      if (applicationResponse) {
        const cdrZip = Buffer.from(applicationResponse, 'base64');

        this.logger.log(
          `sendBill: success for ${zipFileName}, CDR received (${cdrZip.length} bytes)`,
        );

        return {
          success: true,
          cdrZip,
          code: '0',
          message: 'CDR received from SUNAT',
        };
      }

      // No applicationResponse — unexpected but not necessarily an error
      this.logger.warn(
        `sendBill: no applicationResponse for ${zipFileName}`,
      );

      return {
        success: false,
        message: 'No applicationResponse received from SUNAT',
      };
    } catch (error: unknown) {
      return this.handleSoapError('sendBill', zipFileName, error);
    }
  }

  /**
   * Send a daily summary or voided document to SUNAT (asynchronous operation).
   *
   * Used for: Resumen Diario, Comunicacion de Baja.
   *
   * SUNAT responds with a `ticket` number. The caller must then poll `getStatus`
   * until SUNAT finishes processing and returns the CDR.
   *
   * @param zipBuffer   - The ZIP containing the signed XML summary
   * @param zipFileName - SUNAT-mandated format for summaries
   * @param ruc         - Company RUC
   * @param solUser     - SOL username
   * @param solPass     - SOL password
   * @param isBeta      - Environment flag
   */
  async sendSummary(
    zipBuffer: Buffer,
    zipFileName: string,
    ruc: string,
    solUser: string,
    solPass: string,
    isBeta: boolean,
  ): Promise<SunatSendResult> {
    const endpoints = this.resolveEndpoints(isBeta);
    const wsdlUrl = endpoints.invoice;
    const soapUser = `${ruc}${solUser}`;

    this.logger.log(
      `sendSummary: file=${zipFileName}, ruc=${ruc}, env=${isBeta ? 'beta' : 'prod'}`,
    );

    try {
      const client = await this.createSoapClient(wsdlUrl, soapUser, solPass);

      const [result] = await client.sendSummaryAsync({
        fileName: zipFileName,
        contentFile: zipBuffer.toString('base64'),
      });

      const ticket = result?.ticket;

      if (ticket) {
        this.logger.log(
          `sendSummary: ticket received for ${zipFileName}: ${ticket}`,
        );

        return {
          success: true,
          ticket,
          message: `Ticket received: ${ticket}`,
        };
      }

      this.logger.warn(
        `sendSummary: no ticket returned for ${zipFileName}`,
      );

      return {
        success: false,
        message: 'No ticket received from SUNAT',
      };
    } catch (error: unknown) {
      return this.handleSoapError('sendSummary', zipFileName, error);
    }
  }

  /**
   * Check the status of an asynchronous SUNAT operation using its ticket.
   *
   * Status codes returned by SUNAT:
   * - `"0"`  = Received, waiting to be processed
   * - `"98"` = Still processing
   * - `"99"` = Processing complete, CDR available in the response
   *
   * @param ticket  - Ticket number returned by `sendSummary`
   * @param ruc     - Company RUC
   * @param solUser - SOL username
   * @param solPass - SOL password
   * @param isBeta  - Environment flag
   */
  async getStatus(
    ticket: string,
    ruc: string,
    solUser: string,
    solPass: string,
    isBeta: boolean,
  ): Promise<SunatStatusResult> {
    const endpoints = this.resolveEndpoints(isBeta);
    const wsdlUrl = endpoints.invoice;
    const soapUser = `${ruc}${solUser}`;

    this.logger.log(
      `getStatus: ticket=${ticket}, ruc=${ruc}, env=${isBeta ? 'beta' : 'prod'}`,
    );

    try {
      const client = await this.createSoapClient(wsdlUrl, soapUser, solPass);

      const [result] = await client.getStatusAsync({
        ticket,
      });

      const statusResponse = result?.status;

      if (!statusResponse) {
        this.logger.warn(`getStatus: no status response for ticket ${ticket}`);
        return {
          success: false,
          message: 'No status response received from SUNAT',
        };
      }

      const statusCode = statusResponse.statusCode?.toString();
      const content = statusResponse.content;

      // Status 99 means done — CDR is available
      if (statusCode === '99' && content) {
        const cdrZip = Buffer.from(content, 'base64');

        this.logger.log(
          `getStatus: ticket ${ticket} complete, CDR received (${cdrZip.length} bytes)`,
        );

        return {
          success: true,
          cdrZip,
          statusCode,
          code: '0',
          message: 'Processing complete, CDR available',
        };
      }

      // Status 98 means still processing
      if (statusCode === '98') {
        this.logger.log(`getStatus: ticket ${ticket} still processing`);
        return {
          success: true,
          statusCode,
          message: 'SUNAT is still processing the document',
        };
      }

      // Status 0 means received / queued
      if (statusCode === '0') {
        this.logger.log(`getStatus: ticket ${ticket} received, pending`);
        return {
          success: true,
          statusCode,
          message: 'Document received, pending processing',
        };
      }

      // Any other status code — treat as an error from SUNAT
      this.logger.warn(
        `getStatus: ticket ${ticket} returned unexpected statusCode=${statusCode}`,
      );

      return {
        success: false,
        statusCode,
        message: `Unexpected status code: ${statusCode}`,
      };
    } catch (error: unknown) {
      return this.handleGetStatusError(ticket, error);
    }
  }

  // ───────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────

  /**
   * Create and configure a node-soap SOAP client with WS-Security.
   *
   * Uses static local WSDL files to avoid SUNAT WAF issues during WSDL download.
   * Provides a custom axios instance to node-soap that strips User-Agent headers,
   * which SUNAT's WAF blocks with 401 responses.
   */
  private async createSoapClient(
    wsdlUrl: string,
    soapUser: string,
    soapPass: string,
  ): Promise<soap.Client> {
    const { join } = await import('node:path');

    // Static local WSDL files — avoids all SUNAT WAF issues with WSDL fetching.
    // SUNAT's WAF returns 401 for HTTP requests with User-Agent headers on
    // sub-WSDL/XSD URLs. Using bundled files eliminates this entirely.
    const wsdlPath = join(process.cwd(), 'src', 'modules', 'sunat-client', 'wsdl', 'main.wsdl');

    // node-soap 1.7.1 uses axios internally for SOAP HTTP requests.
    // SUNAT WAF blocks 'User-Agent: node-soap/x.x.x' with 401.
    // Provide a custom axios instance that forces an empty User-Agent on all requests.
    const sunatAxios = axios.create({ timeout: 30_000 });
    sunatAxios.interceptors.request.use((config) => {
      config.headers.set('User-Agent', '');
      return config;
    });

    const client = await soap.createClientAsync(wsdlPath, {
      request: sunatAxios,
    } as any);

    // WS-Security: username = {RUC}{SOLUser} (e.g. "20000000001MODDATOS")
    client.setSecurity(new soap.WSSecurity(soapUser, soapPass));

    // Override endpoint to the actual SUNAT service URL (strip ?wsdl)
    const serviceUrl = wsdlUrl.replace('?wsdl', '');
    client.setEndpoint(serviceUrl);

    return client;
  }

  /**
   * Resolve the WSDL endpoint URLs for the given environment.
   */
  private resolveEndpoints(isBeta: boolean): SunatEndpoints {
    if (isBeta) {
      return {
        invoice: SUNAT_ENDPOINTS.BETA.INVOICE,
        retention: SUNAT_ENDPOINTS.BETA.RETENTION,
        guide: SUNAT_ENDPOINTS.BETA.GUIDE,
      };
    }

    return {
      invoice: SUNAT_ENDPOINTS.PRODUCTION.INVOICE,
      retention: SUNAT_ENDPOINTS.PRODUCTION.RETENTION,
      guide: SUNAT_ENDPOINTS.PRODUCTION.GUIDE,
      consultCdr: SUNAT_ENDPOINTS.PRODUCTION.CONSULT_CDR,
      consultValid: SUNAT_ENDPOINTS.PRODUCTION.CONSULT_VALID,
    };
  }

  /**
   * Handle SOAP errors from sendBill / sendSummary.
   *
   * node-soap throws errors with a `root` property containing the parsed
   * SOAP fault. We extract the fault code and string for diagnostics.
   */
  private handleSoapError(
    operation: string,
    fileName: string,
    error: unknown,
  ): SunatSendResult {
    const soapError = error as Record<string, any>;
    const faultCode = soapError?.root?.Envelope?.Body?.Fault?.faultcode;
    const faultString = soapError?.root?.Envelope?.Body?.Fault?.faultstring;

    // Some SOAP faults include a SUNAT-specific code in the detail
    const detail = soapError?.root?.Envelope?.Body?.Fault?.detail;
    const sunatCode = detail?.code ?? detail?.codigoError;
    const sunatMessage = detail?.message ?? detail?.mensajeError ?? faultString;

    if (faultCode || faultString) {
      this.logger.error(
        `${operation}: SOAP fault for ${fileName} — code=${faultCode}, message=${faultString}`,
      );

      return {
        success: false,
        code: sunatCode?.toString(),
        message: sunatMessage?.toString(),
        rawFaultCode: faultCode?.toString(),
        rawFaultString: faultString?.toString(),
      };
    }

    // Generic error (network timeout, DNS, etc.)
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    this.logger.error(
      `${operation}: unexpected error for ${fileName} — ${errorMessage}`,
    );

    return {
      success: false,
      message: `SOAP client error: ${errorMessage}`,
    };
  }

  /**
   * Handle SOAP errors from getStatus.
   */
  private handleGetStatusError(
    ticket: string,
    error: unknown,
  ): SunatStatusResult {
    const soapError = error as Record<string, any>;
    const faultCode = soapError?.root?.Envelope?.Body?.Fault?.faultcode;
    const faultString = soapError?.root?.Envelope?.Body?.Fault?.faultstring;

    if (faultCode || faultString) {
      this.logger.error(
        `getStatus: SOAP fault for ticket ${ticket} — code=${faultCode}, message=${faultString}`,
      );

      return {
        success: false,
        code: faultCode?.toString(),
        message: faultString?.toString(),
      };
    }

    const errorMessage =
      error instanceof Error ? error.message : String(error);

    this.logger.error(
      `getStatus: unexpected error for ticket ${ticket} — ${errorMessage}`,
    );

    return {
      success: false,
      message: `SOAP client error: ${errorMessage}`,
    };
  }
}
