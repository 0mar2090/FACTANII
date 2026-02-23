// ═══════════════════════════════════════════════════════════════════
// PDF Data Interfaces — Data structures for PDF invoice generation
// ═══════════════════════════════════════════════════════════════════

/**
 * Complete invoice data structure needed to render a PDF document.
 * Used by both A4 and ticket (80mm) templates.
 *
 * All monetary values are plain numbers (not Decimal) for easy formatting.
 * The caller is responsible for converting from Prisma Decimal types.
 */
export interface PdfInvoiceData {
  // ── Company (Emisor) ──
  companyRuc: string;
  companyRazonSocial: string;
  companyDireccion: string;
  companyUbigeo: string;

  // ── Document identification ──
  /** Tipo de documento: 01, 03, 07, 08 */
  tipoDoc: string;
  /** Human-readable name: FACTURA ELECTRONICA, BOLETA DE VENTA ELECTRONICA, etc. */
  tipoDocNombre: string;
  serie: string;
  correlativo: number;
  /** Fecha de emision formatted as dd/MM/yyyy */
  fechaEmision: string;
  /** Fecha de vencimiento formatted as dd/MM/yyyy (optional) */
  fechaVencimiento?: string;
  /** ISO 4217 currency code: PEN, USD, EUR */
  moneda: string;
  /** Currency symbol: S/, $, etc. */
  monedaSimbolo: string;

  // ── Client (Adquiriente) ──
  /** Tipo de documento de identidad: 6=RUC, 1=DNI, etc. */
  clienteTipoDoc: string;
  clienteNumDoc: string;
  clienteNombre: string;
  clienteDireccion?: string;

  // ── Line items ──
  items: PdfInvoiceItem[];

  // ── Totals ──
  opGravadas: number;
  opExoneradas: number;
  opInafectas: number;
  igv: number;
  isc: number;
  icbper: number;
  totalVenta: number;
  /** Amount in words (Spanish), e.g. "MIL QUINIENTOS CON 50/100 SOLES" */
  montoEnLetras: string;

  // ── SUNAT response ──
  /** Base64 data URI of the QR code PNG image */
  qrDataUri?: string;
  /** SHA-256 hash of the signed XML (shown as "Valor resumen") */
  xmlHash?: string;
  /** SUNAT response code, e.g. "0" for accepted */
  sunatCode?: string;
  /** SUNAT response message */
  sunatMessage?: string;

  // ── Payment ──
  /** Forma de pago: Contado or Credito */
  formaPago: string;

  // ── Notes (Nota de Credito / Debito only) ──
  /** Motivo code (Cat 09 or Cat 10) */
  motivoNota?: string;
  /** Human-readable motivo description */
  motivoDescripcion?: string;
  /** Referenced document serie */
  docRefSerie?: string;
  /** Referenced document correlativo */
  docRefCorrelativo?: number;
}

/**
 * Single line item for PDF rendering.
 * All amounts are pre-calculated plain numbers.
 */
export interface PdfInvoiceItem {
  /** Sequential item number (1-based) */
  numero: number;
  cantidad: number;
  /** Unit of measure code: NIU, ZZ, KGM, etc. */
  unidadMedida: string;
  descripcion: string;
  /** Valor unitario sin IGV */
  valorUnitario: number;
  /** IGV amount for this item */
  igv: number;
  /** Valor venta (cantidad x valorUnitario) */
  valorVenta: number;
}
