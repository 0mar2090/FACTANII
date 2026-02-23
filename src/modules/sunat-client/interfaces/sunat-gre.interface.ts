/**
 * OAuth2 token response from SUNAT GRE API.
 */
export interface GreOAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  /** Timestamp when the token was obtained */
  obtainedAt: number;
}

/**
 * Result of sending a GRE via SUNAT REST API.
 *
 * SUNAT returns a ticket number; the CDR must be polled separately.
 */
export interface GreSendResult {
  success: boolean;
  /** Ticket number returned by SUNAT to track processing */
  numTicket?: string;
  /** Reception timestamp from SUNAT */
  fecRecepcion?: string;
  /** Error message if the send failed */
  message?: string;
  /** HTTP status code from the API */
  httpStatus?: number;
}

/**
 * Result of polling GRE CDR status from SUNAT REST API.
 */
export interface GreStatusResult {
  success: boolean;
  /** SUNAT response code (0 = accepted, others = errors) */
  codRespuesta?: string;
  /** CDR ZIP as base64 (only when indCdrGenerado=true) */
  arcCdr?: string;
  /** Whether the CDR has been generated */
  indCdrGenerado?: boolean;
  /** Error message if the poll failed */
  message?: string;
  /** CDR ZIP buffer (decoded from base64) */
  cdrZip?: Buffer;
}
