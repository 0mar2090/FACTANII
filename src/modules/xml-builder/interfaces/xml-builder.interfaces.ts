// ═══════════════════════════════════════════════════════════════════
// XML Builder Interfaces
// Input data structures for UBL 2.1 XML generation (SUNAT Peru)
// ═══════════════════════════════════════════════════════════════════

/**
 * Datos de la empresa emisora para el XML.
 */
export interface XmlCompany {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  direccion: string;
  ubigeo: string;       // 6 digitos
  departamento: string;
  provincia: string;
  distrito: string;
  urbanizacion?: string;
  codigoPais: string;   // PE
}

/**
 * Datos del cliente receptor para el XML.
 */
export interface XmlClient {
  tipoDocIdentidad: string; // Catalogo 06
  numDocIdentidad: string;
  nombre: string;
  direccion?: string;
}

/**
 * Item de linea de comprobante.
 * Valores ya calculados (no se recalculan en el builder).
 */
export interface XmlInvoiceItem {
  cantidad: number;
  unidadMedida: string;     // Catalogo 03 (NIU, ZZ, etc.)
  descripcion: string;
  codigo?: string;          // Codigo interno del producto
  codigoSunat?: string;     // Codigo producto SUNAT
  valorUnitario: number;    // sin IGV (hasta 10 decimales)
  precioUnitario: number;   // con IGV (hasta 10 decimales)
  valorVenta: number;       // cantidad * valorUnitario (2 decimales)
  tipoAfectacion: string;   // Catalogo 07
  igv: number;              // 2 decimales
  isc: number;              // 2 decimales
  icbper: number;           // 2 decimales
  descuento: number;        // 2 decimales
}

/**
 * Condiciones de pago del comprobante.
 */
export interface XmlPaymentTerms {
  formaPago: 'Contado' | 'Credito';
  cuotas?: Array<{
    monto: number;
    moneda: string;
    fechaPago: string; // YYYY-MM-DD
  }>;
}

/**
 * Datos de entrada para construir XML de Factura (01) o Boleta (03).
 */
export interface XmlInvoiceData {
  tipoDoc: string;       // 01 o 03
  serie: string;         // F001, B001, etc.
  correlativo: number;
  tipoOperacion: string; // Catalogo 51
  fechaEmision: string;  // YYYY-MM-DD
  fechaVencimiento?: string;
  moneda: string;        // PEN, USD

  company: XmlCompany;
  client: XmlClient;
  items: XmlInvoiceItem[];

  // Totales
  opGravadas: number;
  opExoneradas: number;
  opInafectas: number;
  opGratuitas: number;
  igv: number;
  isc: number;
  icbper: number;
  otrosCargos: number;
  descuentoGlobal: number;
  totalVenta: number;

  // Pago
  formaPago: XmlPaymentTerms;

  // Leyendas
  montoEnLetras: string;
}

/**
 * Datos de entrada para construir XML de Nota de Credito (07).
 */
export interface XmlCreditNoteData {
  serie: string;
  correlativo: number;
  fechaEmision: string;
  moneda: string;

  // Documento de referencia
  docRefTipo: string;        // Tipo doc referencia (01 o 03)
  docRefSerie: string;
  docRefCorrelativo: number;
  motivoNota: string;        // Catalogo 09
  motivoDescripcion: string;

  company: XmlCompany;
  client: XmlClient;
  items: XmlInvoiceItem[];

  opGravadas: number;
  opExoneradas: number;
  opInafectas: number;
  opGratuitas: number;
  igv: number;
  isc: number;
  icbper: number;
  totalVenta: number;

  montoEnLetras: string;
}

/**
 * Linea de un Resumen Diario (SummaryDocumentsLine).
 * Cada linea representa un comprobante (boleta o nota) incluido en el resumen.
 */
export interface XmlSummaryLine {
  tipoDoc: string;           // 03 (boleta), 07 (NC), 08 (ND)
  serie: string;
  correlativo: number;
  clienteTipoDoc: string;    // Catalogo 06
  clienteNumDoc: string;
  /** 1=Adicionar, 2=Modificar, 3=Anular */
  estado: '1' | '2' | '3';
  moneda: string;
  totalVenta: number;
  opGravadas: number;
  opExoneradas: number;
  opInafectas: number;
  opGratuitas: number;
  otrosCargos: number;
  igv: number;
  isc: number;
  icbper: number;
  /** Para notas de credito/debito: referencia al doc original */
  docRefTipo?: string;
  docRefSerie?: string;
  docRefCorrelativo?: number;
}

/**
 * Datos de entrada para construir XML de Resumen Diario (RC).
 */
export interface XmlSummaryData {
  /** Correlativo del resumen (secuencial por dia) */
  correlativo: number;
  /** Fecha de emision de los documentos resumidos (YYYY-MM-DD) */
  fechaReferencia: string;
  /** Fecha de generacion del resumen (YYYY-MM-DD) */
  fechaEmision: string;
  company: XmlCompany;
  items: XmlSummaryLine[];
}

/**
 * Linea de una Comunicacion de Baja (VoidedDocumentsLine).
 */
export interface XmlVoidedLine {
  tipoDoc: string;           // 01, 03, 07, 08
  serie: string;
  correlativo: number;
  motivo: string;            // Razon de la baja
}

/**
 * Datos de entrada para construir XML de Comunicacion de Baja (RA).
 */
export interface XmlVoidedData {
  /** Correlativo de la baja (secuencial por dia) */
  correlativo: number;
  /** Fecha de emision de los documentos dados de baja (YYYY-MM-DD) */
  fechaReferencia: string;
  /** Fecha de generacion de la baja (YYYY-MM-DD) */
  fechaEmision: string;
  company: XmlCompany;
  items: XmlVoidedLine[];
}

/**
 * Datos de entrada para construir XML de Nota de Debito (08).
 */
export interface XmlDebitNoteData {
  serie: string;
  correlativo: number;
  fechaEmision: string;
  moneda: string;

  // Documento de referencia
  docRefTipo: string;        // Tipo doc referencia (01 o 03)
  docRefSerie: string;
  docRefCorrelativo: number;
  motivoNota: string;        // Catalogo 10
  motivoDescripcion: string;

  company: XmlCompany;
  client: XmlClient;
  items: XmlInvoiceItem[];

  opGravadas: number;
  opExoneradas: number;
  opInafectas: number;
  opGratuitas: number;
  igv: number;
  isc: number;
  icbper: number;
  totalVenta: number;

  montoEnLetras: string;
}
