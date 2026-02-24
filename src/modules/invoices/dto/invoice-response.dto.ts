export interface InvoiceResponseDto {
  id: string;
  tipoDoc: string;
  serie: string;
  correlativo: number;
  fechaEmision: string;
  clienteNombre: string;
  clienteNumDoc: string;
  moneda: string;
  totalVenta: number;
  status: string;
  sunatCode?: string;
  sunatMessage?: string;
  /** SUNAT observation notes from CDR (e.g., warnings about non-critical issues) */
  sunatNotes?: string[];
  xmlHash?: string;
  createdAt: string;
  /** Detracción fields */
  codigoDetraccion?: string;
  porcentajeDetraccion?: number;
  montoDetraccion?: number;
  cuentaDetraccion?: string;
  /** Anticipos and related documents */
  anticiposData?: unknown;
  docsRelacionadosData?: unknown;
  opExportacion?: number;
}

/**
 * Extended response for async documents (RC, RA) that return a SUNAT ticket.
 * Includes both the database primary key (id) and the SUNAT document identifier.
 */
export interface SummaryResponseDto extends InvoiceResponseDto {
  /** SUNAT ticket number for polling getStatus */
  ticket?: string;
  /** SUNAT document identifier (e.g., "RC-20260223-00001") */
  sunatDocumentId: string;
}
