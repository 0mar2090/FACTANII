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
  xmlHash?: string;
  createdAt: string;
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
