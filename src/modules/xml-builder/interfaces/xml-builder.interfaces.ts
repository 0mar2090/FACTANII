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

// ═══════════════════════════════════════════════════════════════════
// Retención (20), Percepción (40), Guía de Remisión (09)
// ═══════════════════════════════════════════════════════════════════

/**
 * Línea de un Comprobante de Retención.
 * Cada línea representa un documento al que se le aplicó retención.
 */
export interface XmlRetentionLine {
  tipoDocRelacionado: string;       // Cat 01 (01=factura, 03=boleta, etc.)
  serieDocRelacionado: string;
  correlativoDocRelacionado: number;
  fechaDocRelacionado: string;      // YYYY-MM-DD
  moneda: string;                   // PEN, USD
  importeTotal: number;             // Importe total del documento
  fechaPago: string;                // YYYY-MM-DD
  importeRetenido: number;
  importePagado: number;            // importeTotal - importeRetenido
  tipoCambio?: number;              // Solo si moneda != PEN
}

/**
 * Datos de entrada para construir XML de Comprobante de Retención (20).
 */
export interface XmlRetentionData {
  serie: string;             // R001, etc.
  correlativo: number;
  fechaEmision: string;      // YYYY-MM-DD
  regimenRetencion: string;  // Cat 23: '01' (3%) o '02' (6%)
  tasaRetencion: number;     // 0.03 o 0.06
  company: XmlCompany;
  proveedor: XmlClient;      // A quien se le retiene
  items: XmlRetentionLine[];
  totalRetenido: number;
  totalPagado: number;
  moneda: string;
}

/**
 * Línea de un Comprobante de Percepción.
 */
export interface XmlPerceptionLine {
  tipoDocRelacionado: string;
  serieDocRelacionado: string;
  correlativoDocRelacionado: number;
  fechaDocRelacionado: string;
  moneda: string;
  importeTotal: number;
  fechaCobro: string;               // YYYY-MM-DD
  importePercibido: number;
  importeCobrado: number;           // importeTotal + importePercibido
  tipoCambio?: number;
}

/**
 * Datos de entrada para construir XML de Comprobante de Percepción (40).
 */
export interface XmlPerceptionData {
  serie: string;              // P001, etc.
  correlativo: number;
  fechaEmision: string;
  regimenPercepcion: string;  // Cat 22: '01', '02', '03'
  tasaPercepcion: number;     // 0.02, 0.01, 0.005
  company: XmlCompany;
  cliente: XmlClient;         // A quien se le percibe
  items: XmlPerceptionLine[];
  totalPercibido: number;
  totalCobrado: number;
  moneda: string;
}

/**
 * Item de una Guía de Remisión.
 */
export interface XmlGuideItem {
  cantidad: number;
  unidadMedida: string;      // Cat 03 (NIU, KGM, etc.)
  descripcion: string;
  codigo?: string;
}

/**
 * Dirección de punto de partida/llegada para Guía de Remisión.
 */
export interface XmlGuideAddress {
  ubigeo: string;            // 6 dígitos
  direccion: string;
}

/**
 * Datos de entrada para construir XML de Guía de Remisión Electrónica (09).
 */
export interface XmlGuideData {
  serie: string;              // T001, etc.
  correlativo: number;
  fechaEmision: string;
  fechaTraslado: string;      // YYYY-MM-DD inicio de traslado
  motivoTraslado: string;     // Cat 20
  descripcionMotivo?: string;
  /** Referenced document when motivoTraslado='01' (Venta) */
  docReferencia?: {
    tipoDoc: string;            // '01' factura, '03' boleta
    serieDoc: string;
    correlativoDoc: number;
  };
  modalidadTransporte: string; // Cat 18: '01' (publico) o '02' (privado)
  pesoTotal: number;
  unidadPeso: string;         // 'KGM'
  numeroBultos?: number;
  puntoPartida: XmlGuideAddress;
  puntoLlegada: XmlGuideAddress;
  company: XmlCompany;
  destinatario: XmlClient;
  transportista?: {
    tipoDoc: string;
    numDoc: string;
    nombre: string;
    registroMTC?: string;
  };
  conductor?: {
    tipoDoc: string;
    numDoc: string;
    nombres: string;
    apellidos: string;
    licencia?: string;
  };
  vehiculo?: {
    placa: string;
    placaSecundaria?: string;
  };
  items: XmlGuideItem[];
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
