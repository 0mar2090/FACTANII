import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash } from 'node:crypto';
import {
  SUNAT_GRE_ENDPOINTS,
  SUNAT_GRE_OAUTH_SCOPE,
} from '../../common/constants/index.js';
import type {
  GreOAuthToken,
  GreSendResult,
  GreStatusResult,
} from './interfaces/index.js';

/**
 * SUNAT GRE REST API client (RS 000112-2021, vigente 2025-2026).
 *
 * Since 2022 SUNAT migrated Guías de Remisión Electrónicas (GRE) from SOAP
 * to a REST API with OAuth2 authentication. This service handles:
 *
 * 1. OAuth2 token acquisition (password grant with SOL credentials)
 * 2. Sending signed ZIP to SUNAT GRE REST API (returns ticket)
 * 3. Polling ticket status to retrieve CDR
 *
 * Unlike the SOAP service, GRE REST is always asynchronous:
 * send returns a ticket, then you poll for CDR.
 */
@Injectable()
export class SunatGreClientService {
  private readonly logger = new Logger(SunatGreClientService.name);

  /** In-memory token cache keyed by `{ruc}:{solUser}` */
  private readonly tokenCache = new Map<string, GreOAuthToken>();

  /** Singleflight: deduplicate concurrent token requests for the same key */
  private readonly pendingTokens = new Map<string, Promise<GreOAuthToken>>();

  /** Maximum number of cached tokens to prevent unbounded memory growth */
  private static readonly MAX_TOKEN_CACHE_SIZE = 100;

  constructor(private readonly configService: ConfigService) {}

  // ───────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────

  /**
   * Send a signed GRE ZIP to SUNAT via REST API.
   *
   * @param zipBuffer  - The ZIP containing the signed XML
   * @param zipFileName - SUNAT format: `{RUC}-09-{SERIE}-{CORRELATIVO}.zip`
   * @param ruc        - Company RUC (11 digits)
   * @param solUser    - SOL username
   * @param solPass    - SOL password
   * @param serie      - Guide series (e.g., T001)
   * @param correlativo - Guide number
   * @param isBeta     - `true` for beta environment
   * @param clientId   - OAuth2 client ID (from SUNAT API platform)
   * @param clientSecret - OAuth2 client secret
   */
  async sendGuide(
    zipBuffer: Buffer,
    zipFileName: string,
    ruc: string,
    solUser: string,
    solPass: string,
    serie: string,
    correlativo: number,
    isBeta: boolean,
    clientId?: string,
    clientSecret?: string,
  ): Promise<GreSendResult> {
    const endpoints = this.resolveEndpoints(isBeta);

    this.logger.log(
      `sendGuide: file=${zipFileName}, ruc=${ruc}, env=${isBeta ? 'beta' : 'prod'}`,
    );

    try {
      // 1. Get OAuth2 token
      const token = await this.getToken(
        ruc, solUser, solPass, isBeta, clientId, clientSecret,
      );

      // 2. Compute SHA-256 hash of the ZIP
      const hashZip = createHash('sha256').update(zipBuffer).digest('hex');

      // 3. Build document ID: {RUC}-09-{SERIE}-{CORRELATIVO 8 digits}
      const numero = String(correlativo).padStart(8, '0');
      const docId = `${ruc}-09-${serie}-${numero}`;

      // 4. Send to SUNAT GRE REST API
      const url = `${endpoints.api}/comprobantes/${docId}`;
      const body = {
        archivo: {
          nomArchivo: zipFileName,
          arcGreZip: zipBuffer.toString('base64'),
          hashZip,
        },
      };

      const response = await axios.post(url, body, {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
        validateStatus: () => true, // handle all status codes
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.data;
        this.logger.log(
          `sendGuide: success for ${zipFileName}, ticket=${data.numTicket}`,
        );

        return {
          success: true,
          numTicket: data.numTicket,
          fecRecepcion: data.fecRecepcion,
        };
      }

      // API error
      const errorMsg = response.data?.msg ?? response.data?.message ?? JSON.stringify(response.data);
      this.logger.error(
        `sendGuide: API error for ${zipFileName} — HTTP ${response.status}: ${errorMsg}`,
      );

      return {
        success: false,
        message: `SUNAT GRE API error (HTTP ${response.status}): ${errorMsg}`,
        httpStatus: response.status,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `sendGuide: unexpected error for ${zipFileName} — ${errorMessage}`,
      );

      return {
        success: false,
        message: `GRE client error: ${errorMessage}`,
      };
    }
  }

  /**
   * Poll the status of a GRE submission by ticket number.
   *
   * @param numTicket  - Ticket returned by sendGuide
   * @param ruc        - Company RUC
   * @param solUser    - SOL username
   * @param solPass    - SOL password
   * @param isBeta     - Environment flag
   * @param clientId   - OAuth2 client ID
   * @param clientSecret - OAuth2 client secret
   */
  async getGuideStatus(
    numTicket: string,
    ruc: string,
    solUser: string,
    solPass: string,
    isBeta: boolean,
    clientId?: string,
    clientSecret?: string,
  ): Promise<GreStatusResult> {
    const endpoints = this.resolveEndpoints(isBeta);

    this.logger.log(
      `getGuideStatus: ticket=${numTicket}, ruc=${ruc}, env=${isBeta ? 'beta' : 'prod'}`,
    );

    try {
      const token = await this.getToken(
        ruc, solUser, solPass, isBeta, clientId, clientSecret,
      );

      const url = `${endpoints.api}/comprobantes/envios/${numTicket}`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
        },
        timeout: 30_000,
        validateStatus: () => true,
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.data;

        const result: GreStatusResult = {
          success: true,
          codRespuesta: data.codRespuesta,
          arcCdr: data.arcCdr,
          indCdrGenerado: data.indCdrGenerado,
        };

        // Decode CDR if available
        if (data.indCdrGenerado && data.arcCdr) {
          result.cdrZip = Buffer.from(data.arcCdr, 'base64');
          this.logger.log(
            `getGuideStatus: ticket ${numTicket} complete, CDR received (${result.cdrZip.length} bytes)`,
          );
        } else {
          this.logger.log(
            `getGuideStatus: ticket ${numTicket} — codRespuesta=${data.codRespuesta}, cdrGenerado=${data.indCdrGenerado}`,
          );
        }

        return result;
      }

      const errorMsg = response.data?.msg ?? response.data?.message ?? JSON.stringify(response.data);
      this.logger.error(
        `getGuideStatus: API error for ticket ${numTicket} — HTTP ${response.status}: ${errorMsg}`,
      );

      return {
        success: false,
        message: `SUNAT GRE API error (HTTP ${response.status}): ${errorMsg}`,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `getGuideStatus: unexpected error for ticket ${numTicket} — ${errorMessage}`,
      );

      return {
        success: false,
        message: `GRE client error: ${errorMessage}`,
      };
    }
  }

  // ───────────────────────────────────────────
  // OAuth2 Token Management
  // ───────────────────────────────────────────

  /**
   * Get an OAuth2 access token for the SUNAT GRE API.
   * Uses password grant with SOL credentials.
   * Tokens are cached in memory and reused until near expiry.
   * Concurrent requests for the same key are deduplicated (singleflight).
   */
  async getToken(
    ruc: string,
    solUser: string,
    solPass: string,
    isBeta: boolean,
    clientId?: string,
    clientSecret?: string,
  ): Promise<GreOAuthToken> {
    const cacheKey = `${ruc}:${solUser}`;

    // Check cache — reuse token if still valid (with 60s margin)
    const cached = this.tokenCache.get(cacheKey);
    if (cached && this.isTokenValid(cached)) {
      return cached;
    }

    // Singleflight: if another caller is already fetching this token, wait for it
    const pending = this.pendingTokens.get(cacheKey);
    if (pending) {
      return pending;
    }

    // Start the token fetch and register it as pending
    const tokenPromise = this.fetchToken(ruc, solUser, solPass, isBeta, clientId, clientSecret, cacheKey);
    this.pendingTokens.set(cacheKey, tokenPromise);

    try {
      return await tokenPromise;
    } finally {
      this.pendingTokens.delete(cacheKey);
    }
  }

  /**
   * Internal: actually fetch the OAuth2 token from SUNAT.
   */
  private async fetchToken(
    ruc: string,
    solUser: string,
    solPass: string,
    isBeta: boolean,
    clientId: string | undefined,
    clientSecret: string | undefined,
    cacheKey: string,
  ): Promise<GreOAuthToken> {
    const endpoints = this.resolveEndpoints(isBeta);

    // Resolve client credentials
    const resolvedClientId = clientId
      || this.configService.get<string>('sunat.greClientId')
      || '';
    const resolvedClientSecret = clientSecret
      || this.configService.get<string>('sunat.greClientSecret')
      || '';

    if (!resolvedClientId) {
      throw new Error(
        'SUNAT GRE OAuth2 client ID is required. ' +
        'Set SUNAT_GRE_CLIENT_ID environment variable or pass clientId parameter.',
      );
    }

    // OAuth2 password grant
    const tokenUrl = `${endpoints.auth}/${resolvedClientId}/oauth2/token`;
    const params = new URLSearchParams({
      grant_type: 'password',
      scope: SUNAT_GRE_OAUTH_SCOPE,
      username: `${ruc}${solUser}`,
      password: solPass,
    });

    // Add client_secret if provided (required for some SUNAT API configurations)
    if (resolvedClientSecret) {
      params.append('client_secret', resolvedClientSecret);
    }

    this.logger.log(
      `getToken: requesting OAuth2 token for ${ruc}${solUser}, env=${isBeta ? 'beta' : 'prod'}`,
    );

    try {
      const response = await axios.post(tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15_000,
      });

      const token: GreOAuthToken = {
        access_token: response.data.access_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        obtainedAt: Date.now(),
      };

      // Evict oldest entries if cache exceeds size limit
      if (this.tokenCache.size >= SunatGreClientService.MAX_TOKEN_CACHE_SIZE) {
        const oldestKey = this.tokenCache.keys().next().value;
        if (oldestKey) this.tokenCache.delete(oldestKey);
      }

      // Cache the token
      this.tokenCache.set(cacheKey, token);

      this.logger.log(
        `getToken: token acquired for ${ruc}${solUser}, expires_in=${token.expires_in}s`,
      );

      return token;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const axiosErr = error as any;
      const httpStatus = axiosErr?.response?.status;
      const responseBody = axiosErr?.response?.data;

      this.logger.error(
        `getToken: OAuth2 token request failed for ${ruc}${solUser} — ` +
        `HTTP ${httpStatus ?? 'N/A'}: ${errorMessage}`,
      );

      throw new Error(
        `SUNAT GRE OAuth2 token request failed` +
        (httpStatus ? ` (HTTP ${httpStatus})` : '') +
        `: ${responseBody?.error_description ?? responseBody?.message ?? errorMessage}`,
      );
    }
  }

  // ───────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────

  private isTokenValid(token: GreOAuthToken): boolean {
    const elapsed = (Date.now() - token.obtainedAt) / 1000;
    // Consider expired 60 seconds before actual expiry
    return elapsed < (token.expires_in - 60);
  }

  private resolveEndpoints(isBeta: boolean) {
    if (isBeta) {
      return {
        auth: SUNAT_GRE_ENDPOINTS.BETA.AUTH,
        api: SUNAT_GRE_ENDPOINTS.BETA.API,
      };
    }
    return {
      auth: SUNAT_GRE_ENDPOINTS.PRODUCTION.AUTH,
      api: SUNAT_GRE_ENDPOINTS.PRODUCTION.API,
    };
  }
}
