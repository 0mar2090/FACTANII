/**
 * Result returned by sendBill (synchronous SUNAT operations).
 *
 * For invoices and boletas SUNAT replies immediately with a CDR ZIP.
 * On SOAP fault the error details are captured in rawFault* fields.
 */
export interface SunatSendResult {
  /** Whether SUNAT accepted the document (code "0" or with observations) */
  success: boolean;

  /** CDR ZIP returned by SUNAT (base64-decoded) */
  cdrZip?: Buffer;

  /** SUNAT response code (e.g., "0" accepted, "0100"-"0999" accepted with observations) */
  code?: string;

  /** Human-readable description from SUNAT */
  message?: string;

  /** Observation notes / warnings returned by SUNAT alongside the CDR */
  notes?: string[];

  /** Ticket number for asynchronous operations (sendSummary) */
  ticket?: string;

  /** Raw SOAP fault code when the call fails at transport level */
  rawFaultCode?: string;

  /** Raw SOAP fault string when the call fails at transport level */
  rawFaultString?: string;
}

/**
 * Result returned by getStatus (asynchronous SUNAT operations).
 *
 * Used for summaries and voided documents where SUNAT processes
 * the request asynchronously and returns a ticket.
 */
export interface SunatStatusResult {
  /** Whether the status query succeeded */
  success: boolean;

  /** CDR ZIP once processing is complete */
  cdrZip?: Buffer;

  /** SUNAT response code */
  code?: string;

  /** Human-readable description from SUNAT */
  message?: string;

  /**
   * Status code from getStatus:
   * - "0"  = received / pending
   * - "98" = still processing
   * - "99" = processing complete (CDR available)
   */
  statusCode?: string;
}
