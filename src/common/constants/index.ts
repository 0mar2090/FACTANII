// ═══════════════════════════════════════
// Catálogos SUNAT (Anexo 8 - R.S. 245-2017)
// Fuente: cpe.sunat.gob.pe
// ═══════════════════════════════════════

/** Catálogo 01: Tipo de documento */
export const TIPO_DOCUMENTO = {
  FACTURA: '01',
  BOLETA: '03',
  NOTA_CREDITO: '07',
  NOTA_DEBITO: '08',
  GUIA_REMISION_REMITENTE: '09',
  RETENCION: '20',
  PERCEPCION: '40',
} as const;

/** Catálogo 02: Tipo de moneda (ISO 4217) */
export const TIPO_MONEDA = {
  PEN: 'PEN',
  USD: 'USD',
  EUR: 'EUR',
} as const;

/** Catálogo 03: Tipo de unidad de medida (UN/ECE Rec 20) */
export const UNIDAD_MEDIDA = {
  UNIDAD: 'NIU',
  SERVICIO: 'ZZ',
  KILOGRAMO: 'KGM',
  LITRO: 'LTR',
  METRO: 'MTR',
  METRO_CUADRADO: 'MTK',
  HORA: 'HUR',
  DIA: 'DAY',
  CAJA: 'BX',
  BOLSA: 'BG',
  PIEZA: 'EA',
} as const;

/** Catálogo 05: Código de tipo de tributo */
export const CODIGO_TRIBUTO = {
  IGV: { code: '1000', name: 'IGV', un: 'VAT' },
  IVAP: { code: '1016', name: 'IVAP', un: 'VAT' },
  ISC: { code: '2000', name: 'ISC', un: 'EXC' },
  ICBPER: { code: '7152', name: 'ICBPER', un: 'OTH' },
  EXPORTACION: { code: '9995', name: 'EXP', un: 'FRE' },
  GRATUITO: { code: '9996', name: 'GRA', un: 'FRE' },
  EXONERADO: { code: '9997', name: 'EXO', un: 'VAT' },
  INAFECTO: { code: '9998', name: 'INA', un: 'FRE' },
  OTROS: { code: '9999', name: 'OTROS', un: 'OTH' },
} as const;

/** Catálogo 06: Tipo de documento de identidad */
export const TIPO_DOC_IDENTIDAD = {
  NO_DOMICILIADO: '0',
  DNI: '1',
  CARNET_EXTRANJERIA: '4',
  RUC: '6',
  PASAPORTE: '7',
  OTROS: '-',
} as const;

/** Catálogo 07: Tipo de afectación del IGV */
export const TIPO_AFECTACION_IGV = {
  GRAVADO_OPERACION_ONEROSA: '10',
  GRAVADO_RETIRO_PREMIO: '11',
  GRAVADO_RETIRO_DONACION: '12',
  GRAVADO_RETIRO: '13',
  GRAVADO_RETIRO_PUBLICIDAD: '14',
  GRAVADO_BONIFICACION: '15',
  GRAVADO_RETIRO_ENTREGA_TRABAJADORES: '16',
  GRAVADO_IVAP: '17',
  EXONERADO_OPERACION_ONEROSA: '20',
  EXONERADO_TRANSFERENCIA_GRATUITA: '21',
  INAFECTO_OPERACION_ONEROSA: '30',
  INAFECTO_RETIRO_BONIFICACION: '31',
  INAFECTO_RETIRO: '32',
  INAFECTO_RETIRO_MUESTRAS_MEDICAS: '33',
  INAFECTO_RETIRO_CONVENIO_COLECTIVO: '34',
  INAFECTO_RETIRO_PREMIO: '35',
  INAFECTO_RETIRO_PUBLICIDAD: '36',
  EXPORTACION: '40',
} as const;

/** Catálogo 09: Código de tipo de nota de crédito */
export const MOTIVO_NOTA_CREDITO = {
  ANULACION_OPERACION: '01',
  ANULACION_ERROR_RUC: '02',
  CORRECCION_ERROR_DESCRIPCION: '03',
  DESCUENTO_GLOBAL: '04',
  DESCUENTO_POR_ITEM: '05',
  DEVOLUCION_TOTAL: '06',
  DEVOLUCION_POR_ITEM: '07',
  BONIFICACION: '08',
  DISMINUCION_VALOR: '09',
  OTROS: '10',
  AJUSTES_OPERACIONES_EXPORTACION: '11',
  AJUSTES_AFECTOS_IVAP: '12',
  CORRECCION_ERROR_MONTO: '13',
} as const;

/** Catálogo 10: Código de tipo de nota de débito */
export const MOTIVO_NOTA_DEBITO = {
  INTERESES_POR_MORA: '01',
  AUMENTO_VALOR: '02',
  PENALIDADES: '03',
  OTROS: '11',
} as const;

/** Catálogo 16: Código de tipo de precio de venta */
export const TIPO_PRECIO = {
  PRECIO_UNITARIO_CON_IGV: '01',
  VALOR_REFERENCIAL_GRATUITO: '02',
} as const;

/** Catálogo 17: Tipo de operación (listID en InvoiceTypeCode) */
export const TIPO_OPERACION = {
  VENTA_INTERNA: '0101',
  VENTA_INTERNA_ANTICIPOS: '0100',
  VENTA_INTERNA_ITINERANTE: '0104',
  VENTA_INTERNA_GRM: '0112',
  EXPORTACION: '0200',
  EXPORTACION_SERVICIOS: '0201',
  EXPORTACION_SERVICIOS_HOSPEDAJE: '0208',
  DETRACCION: '1001',
  PERCEPCION: '2001',
  GRATUITA: '0101', // mismo code, se diferencia por tipoAfectacion
} as const;

/** Catálogo 51: Tipo de operación (para InvoiceTypeCode/@listID) */
export const TIPO_OPERACION_51 = TIPO_OPERACION;

/** Catálogo 52: Códigos de leyenda */
export const LEYENDA = {
  MONTO_EN_LETRAS: '1000',
  OPERACION_GRATUITA: '1002',
  OPERACION_NO_ONEROSA: '2000',
  SERVICIO_HOSPEDAJE_NO_DOMICILIADO: '2001',
  OPERACION_DETRACCION: '2006',
  OPERACION_PERCEPCION: '2007',
  ICBPER: '2010',
} as const;

// ═══════════════════════════════════════
// Constantes de negocio SUNAT
// ═══════════════════════════════════════

/** Tasa IGV vigente (18%) */
export const IGV_RATE = 0.18;

/** Tasa ICBPER por unidad (2026) — S/ 0.50 */
export const ICBPER_RATE = 0.50;

/** UIT 2026 — S/ 5,500 */
export const UIT_2026 = 5500;

/** Plazo máximo para enviar CPE a SUNAT (días calendario) */
export const MAX_DAYS_TO_SEND = 3;

/** Catálogo 18: Modalidad de transporte */
export const MODALIDAD_TRANSPORTE = {
  TRANSPORTE_PUBLICO: '01',
  TRANSPORTE_PRIVADO: '02',
} as const;

/** Catálogo 20: Motivo de traslado (Guía de Remisión) */
export const MOTIVO_TRASLADO = {
  VENTA: '01',
  COMPRA: '02',
  VENTA_SUJETA_CONFIRMACION: '03',
  CONSIGNACION: '04',
  DEVOLUCION: '06',
  RECOJO_BIENES_TRANSFORMADOS: '07',
  TRASLADO_ENTRE_ESTABLECIMIENTOS: '08',
  TRASLADO_ZONA_PRIMARIA: '09',
  TRASLADO_EMISOR_ITINERANTE: '11',
  IMPORTACION: '13',
  EXPORTACION: '14',
  VENTA_SUJETA_DESTINATARIO_NO_CONFIRMADO: '17',
  TRASLADO_A_ZONA_PRIMARIA: '18',
  OTROS: '19',
} as const;

/** Catálogo 22: Régimen de percepción */
export const REGIMEN_PERCEPCION = {
  VENTA_INTERNA_2: '01',
  ADQUISICION_COMBUSTIBLE_1: '02',
  VENTA_INTERNA_AL_0_5: '03',
} as const;

/** Catálogo 23: Régimen de retención */
export const REGIMEN_RETENCION = {
  TASA_3: '01',
  TASA_6: '02',
} as const;

/** Tasas de retención por régimen */
export const RETENCION_RATES: Record<string, number> = {
  '01': 0.03,
  '02': 0.06,
} as const;

/** Tasas de percepción por régimen */
export const PERCEPCION_RATES: Record<string, number> = {
  '01': 0.02,
  '02': 0.01,
  '03': 0.005,
} as const;

/** Namespaces UBL 2.1 */
export const UBL_NAMESPACES = {
  INVOICE: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  CREDIT_NOTE: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  DEBIT_NOTE: 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2',
  SUMMARY_DOCUMENTS: 'urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1',
  VOIDED_DOCUMENTS: 'urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1',
  DESPATCH_ADVICE: 'urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2',
  RETENTION: 'urn:sunat:names:specification:ubl:peru:schema:xsd:Retention-1',
  PERCEPTION: 'urn:sunat:names:specification:ubl:peru:schema:xsd:Perception-1',
  CAC: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  CBC: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  DS: 'http://www.w3.org/2000/09/xmldsig#',
  EXT: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  SAC: 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
  QDT: 'urn:oasis:names:specification:ubl:schema:xsd:QualifiedDataTypes-2',
  UDT: 'urn:oasis:names:specification:ubl:schema:xsd:UnqualifiedDataTypes-2',
} as const;

/** Endpoints SUNAT — SOAP services */
export const SUNAT_ENDPOINTS = {
  BETA: {
    INVOICE: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl',
    RETENTION: 'https://e-beta.sunat.gob.pe/ol-ti-itemision-otroscpe-gem-beta/billService?wsdl',
  },
  PRODUCTION: {
    INVOICE: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl',
    RETENTION: 'https://e-factura.sunat.gob.pe/ol-ti-itemision-otroscpe-gem/billService?wsdl',
    CONSULT_CDR: 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService?wsdl',
    CONSULT_VALID: 'https://e-factura.sunat.gob.pe/ol-it-wsconsvalidcpe/billValidService?wsdl',
  },
} as const;

/** Endpoints SUNAT — GRE REST API (RS 000112-2021, vigente 2025-2026) */
export const SUNAT_GRE_ENDPOINTS = {
  BETA: {
    AUTH: 'https://gre-beta.sunat.gob.pe/v1/clientessol',
    API: 'https://gre-beta.sunat.gob.pe/v1/contribuyente/gem',
  },
  PRODUCTION: {
    AUTH: 'https://api-seguridad.sunat.gob.pe/v1/clientessol',
    API: 'https://api-cpe.sunat.gob.pe/v1/contribuyente/gem',
  },
} as const;

/** OAuth2 scope for SUNAT GRE API */
export const SUNAT_GRE_OAUTH_SCOPE = 'https://api-cpe.sunat.gob.pe' as const;

/** Credenciales beta de prueba */
export const SUNAT_BETA_CREDENTIALS = {
  RUC: '20000000001',
  USER: 'MODDATOS',
  PASS: 'moddatos',
} as const;
