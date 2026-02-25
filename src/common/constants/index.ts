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
  OTROS: '10',
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
  // Exportación (0200-0208)
  EXPORTACION: '0200',
  EXPORTACION_SERVICIOS_PAIS: '0201',
  EXPORTACION_SERVICIOS_HOSPEDAJE: '0202',
  EXPORTACION_SERVICIOS_TRANSPORTE: '0203',
  EXPORTACION_SERVICIOS_TURISTICO: '0204',
  EXPORTACION_SERVICIOS_ENERGIA: '0205',
  EXPORTACION_SERVICIOS_LEY29646: '0206',
  EXPORTACION_SERVICIOS_REPARACION: '0207',
  EXPORTACION_SERVICIOS_OTROS: '0208',
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
  OPERACION_IVAP: '2007',
  ICBPER: '2010',
} as const;

/** Catálogo 54: Códigos de bienes y servicios sujetos a detracción (SPOT) */
export const CODIGO_DETRACCION = {
  // Bienes sujetos a detracción (Anexo 1)
  AZUCAR: '001',
  ALCOHOL_ETILICO: '003',
  // Bienes sujetos a detracción (Anexo 2)
  RECURSOS_HIDROBIOLOGICOS: '004',
  MAIZ_AMARILLO_DURO: '005',
  ARROZ_PILADO: '008',
  MADERA: '009',
  ARENA_PIEDRA: '010',
  RESIDUOS_SUBPRODUCTOS: '011',
  BIENES_GRAVADOS_IGV: '012',
  CANA_AZUCAR_SPOT: '013',
  ACEITE_PESCADO: '015',
  HARINA_POLVO_PESCADO: '016',
  HARINA_POLVO_PELLETS_PESCADO: '017',
  ANIMALES_VIVOS: '018',
  ABONOS: '019',
  ALGODON: '021',
  MINERALES_METALICOS: '023',
  ORO_DEMAS_MINERALES: '024',
  MINERALES_NO_METALICOS: '025',
  BIEN_EXONERADO_IGV: '031',
  PAPRIKA_CAPSICUM: '032',
  MINERALES_METALICOS_NO_AURIFEROS: '034',
  BIENES_EXONERADOS_IGV: '035',
  ORO_MINERALES_EXONERADOS_IGV: '036',
  ORO_GRAVADO_IGV: '039',
  PLOMO: '041',
  // Minerales — Res. 000086-2025/SUNAT y 000121-2025/SUNAT (abril 2025)
  MINERALES_ORO_CONCENTRADOS: '044',
  MINERALES_NO_AURIFEROS_CONCENTRADOS: '045',
  SERVICIOS_BENEFICIO_MINERALES: '046',
  // Servicios sujetos a detracción (Anexo 3)
  INTERMEDIACION_LABORAL: '014',
  ARRENDAMIENTO_BIENES_MUEBLES: '020',
  CANA_AZUCAR: '022',
  TRANSPORTE_PERSONAS: '026',
  TRANSPORTE_CARGA: '027',
  CONTRATOS_CONSTRUCCION: '030',
  OTROS_SERVICIOS_EMPRESARIALES: '037',
  FABRICACION_ENCARGO: '040',
} as const;

/** Tasa de detracción general para servicios (12%) */
export const DETRACCION_DEFAULT_RATE = 0.12;

/** Catálogo 12 — Documentos relacionados tributarios */
export const TIPO_DOCUMENTO_RELACIONADO = {
  FACTURA_CORRECCION_RUC: '01',
  FACTURA_ANTICIPOS: '02',
  BOLETA_ANTICIPOS: '03',
  TICKET_ENAPU: '04',
  CODIGO_SCOP: '05',
  FACTURA_ELECTRONICA_REMITENTE: '06',
  GUIA_REMISION_REMITENTE: '07',
  DECLARACION_DEPOSITO_FRANCO: '08',
  DECLARACION_SIMPLIFICADA_IMPORTACION: '09',
  LIQUIDACION_COMPRA_ANTICIPOS: '10',
  OTROS: '99',
} as const;

/** Catálogo 59 — Medios de pago */
export const MEDIO_PAGO = {
  DEPOSITO_EN_CUENTA: '001',
  GIRO: '002',
  TRANSFERENCIA_FONDOS: '003',
  ORDEN_PAGO: '004',
  TARJETA_DEBITO: '005',
  TARJETA_CREDITO_NACIONAL: '006',
  CHEQUE_NO_NEGOCIABLE: '007',
  EFECTIVO_SIN_OBLIGACION: '008',
  EFECTIVO_OTROS: '009',
  MEDIOS_COMERCIO_EXTERIOR: '010',
  DOCUMENTOS_EDPYME_COOPERATIVAS: '011',
  TARJETA_CREDITO_NO_FINANCIERA: '012',
  TARJETA_CREDITO_EXTERIOR: '013',
  TRANSFERENCIA_COMERCIO_EXTERIOR: '101',
  CHEQUE_BANCARIO_COMERCIO_EXTERIOR: '102',
  ORDEN_PAGO_SIMPLE_EXTERIOR: '103',
  ORDEN_PAGO_DOCUMENTARIO_EXTERIOR: '104',
  REMESA_SIMPLE_EXTERIOR: '105',
  REMESA_DOCUMENTARIA_EXTERIOR: '106',
  CARTA_CREDITO_SIMPLE_EXTERIOR: '107',
  CARTA_CREDITO_DOCUMENTARIO_EXTERIOR: '108',
  OTROS: '999',
} as const;

/** Tasas oficiales de detracción SUNAT por código (Cat 54) — vigentes 2025-2026 */
export const DETRACCION_RATES: Record<string, number> = {
  // Anexo I — Bienes (venta gravada con IGV)
  '001': 0.10,  // Azúcar y melaza de caña
  '003': 0.10,  // Alcohol etílico
  // Anexo II — Bienes sujetos al SPOT
  '004': 0.04,  // Recursos hidrobiológicos
  '005': 0.04,  // Maíz amarillo duro
  '008': 0.04,  // Madera
  '009': 0.10,  // Arena y piedra
  '010': 0.15,  // Residuos, subproductos, desechos, recortes
  '013': 0.10,  // Caña de azúcar
  '014': 0.04,  // Carne y despojos comestibles
  '016': 0.10,  // Aceite de pescado
  '017': 0.04,  // Harina, polvo y pellets de pescado
  '023': 0.04,  // Leche
  '031': 0.10,  // Oro gravado con IGV
  '032': 0.10,  // Páprika y capsicum
  '034': 0.10,  // Minerales metálicos no auríferos
  '035': 0.015, // Bienes exonerados del IGV
  '036': 0.015, // Oro y demás minerales metalicos exonerados del IGV
  '039': 0.10,  // Minerales no metálicos
  '041': 0.15,  // Plomo
  // Minerales — Res. 000086-2025/SUNAT (abril 2025)
  '044': 0.10,  // Oro y concentrados de minerales auríferos (trasladado Anexo 1)
  '045': 0.10,  // Minerales metálicos no auríferos y sus concentrados (trasladado Anexo 1)
  '046': 0.12,  // Servicio de beneficio de minerales (Anexo 3)
  // Anexo III — Servicios
  '012': 0.12,  // Intermediación laboral y tercerización
  '019': 0.10,  // Arrendamiento de bienes
  '020': 0.12,  // Mantenimiento y reparación de bienes muebles
  '021': 0.10,  // Movimiento de carga
  '022': 0.12,  // Otros servicios empresariales
  '024': 0.10,  // Comisión mercantil
  '025': 0.10,  // Fabricación de bienes por encargo
  '026': 0.10,  // Servicio de transporte de personas
  '027': 0.04,  // Servicio de transporte de carga
  '030': 0.04,  // Contratos de construcción
  '037': 0.12,  // Demás servicios gravados con el IGV
};

/** Umbral mínimo para detracción — Anexo 2 y 3 (S/) */
export const DETRACCION_THRESHOLD = 700;

/** Umbral mínimo para detracción — transporte terrestre de bienes (S/) */
export const DETRACCION_THRESHOLD_TRANSPORT = 400;

/** Fracción UIT para umbral Anexo 1 (½ UIT) */
export const DETRACCION_THRESHOLD_ANNEX1_UIT_FRACTION = 0.5;

/** Tasa IGV reducida para MYPE restaurantes, hoteles y alojamientos turísticos
 *  Ley 31556, vigente 2025-2026: 8% IGV + 2% IPM = 10% total
 *  2027: 12% IGV + 2% IPM = 14% total
 *  2028+: 16% IGV + 2% IPM = 18% (estándar)
 */
export const IGV_RESTAURANT_RATE = 0.10;

// ═══════════════════════════════════════
// Constantes de negocio SUNAT
// ═══════════════════════════════════════

/** Tasa IGV vigente (18%) */
export const IGV_RATE = 0.18;

/** Tasa IVAP vigente (4%) — Impuesto a la Venta de Arroz Pilado */
export const IVAP_RATE = 0.04;

/** Tasa ICBPER por unidad (2026) — S/ 0.50 */
export const ICBPER_RATE = 0.50;

/** UIT 2026 — S/ 5,500 */
export const UIT_2026 = 5500;

/** Plazo máximo para enviar CPE a SUNAT (días calendario) — por tipo de documento */
export const MAX_DAYS_TO_SEND = 3;

/**
 * Per-document-type sending windows (calendar days from emission).
 * Sources: RS 340-2017, RS 253-2018, updates 2024-2026.
 *
 * - Factura (01): 3 days
 * - Boleta (03): 7 days
 * - NC/ND (07/08): 3 days
 * - GRE (09): 7 days
 * - CRE (20): 9 days
 * - CPE (40): 9 days
 * - RC/RA: no strict window (validated by SUNAT at service level)
 */
export const MAX_DAYS_BY_DOC_TYPE: Record<string, number> = {
  '01': 3,
  '03': 7,
  '07': 3,
  '08': 3,
  '09': 7,
  '20': 9,
  '40': 9,
} as const;

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
  /** Traslado de Mercancía Extranjera — Res. 000133-2025/SUNAT, obligatorio julio 2026 */
  TRASLADO_MERCANCIA_EXTRANJERA: '19',
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

/** Nombres de documento por código SUNAT (para PDFs y UI) */
export const TIPO_DOC_NOMBRES: Record<string, string> = {
  '01': 'FACTURA ELECTRÓNICA',
  '03': 'BOLETA DE VENTA ELECTRÓNICA',
  '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
  '08': 'NOTA DE DÉBITO ELECTRÓNICA',
  '09': 'GUÍA DE REMISIÓN ELECTRÓNICA',
  '20': 'COMPROBANTE DE RETENCIÓN ELECTRÓNICA',
  '40': 'COMPROBANTE DE PERCEPCIÓN ELECTRÓNICA',
  'RC': 'RESUMEN DIARIO',
  'RA': 'COMUNICACIÓN DE BAJA',
} as const;

/** Símbolos de moneda (para PDFs y UI) */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  PEN: 'S/',
  USD: 'US$',
  EUR: '€',
} as const;

/** Catálogo 62: Códigos de bienes y servicios normalizados (UNSPSC) — categorías de nivel superior (2 dígitos) */
export const CODIGO_PRODUCTO_SUNAT_CATEGORIES: Record<string, string> = {
  '10': 'Material vegetal vivo, de vivero y silvicultivo',
  '11': 'Organismos y minerales vivos',
  '12': 'Sustancias químicas',
  '13': 'Resinas, colofonia, caucho y latex',
  '14': 'Materiales, papel y productos de papel',
  '15': 'Combustibles, aditivos para combustibles, lubricantes',
  '20': 'Equipo y maquinaria de minería y pozos de petróleo',
  '21': 'Equipo agrícola, de silvicultura y paisaje',
  '22': 'Maquinaria industrial y de manufactura',
  '23': 'Maquinaria y equipo de manipulación y acondicionamiento de material',
  '24': 'Maquinaria y equipo de manipulación y acondicionamiento de materiales',
  '25': 'Equipo comercial y vehículos de transporte',
  '26': 'Maquinaria y accesorios de generación y distribución de energía',
  '27': 'Herramientas, maquinaria y equipo',
  '30': 'Estructuras, sistemas de construcción',
  '31': 'Componentes y suministros de manufactura',
  '32': 'Componentes y suministros electrónicos',
  '39': 'Luminarias y electricidad',
  '40': 'Equipo de distribución y acondicionamiento',
  '41': 'Equipo de laboratorio, medición y observación',
  '42': 'Equipo e instrumentos médicos',
  '43': 'Tecnología de información y telecomunicaciones',
  '44': 'Equipo de oficina, accesorios y suministros',
  '45': 'Equipo de impresión, fotografía y audiovisual',
  '46': 'Equipamiento de defensa, seguridad',
  '47': 'Equipo de limpieza',
  '48': 'Equipo deportivo y recreativo',
  '49': 'Equipamiento de cocina y comedor',
  '50': 'Productos alimenticios, bebidas y tabaco',
  '51': 'Medicamentos y productos farmacéuticos',
  '52': 'Productos para el hogar, salud personal',
  '53': 'Ropa, maletas y productos de aseo',
  '54': 'Relojería, joyería y piedras preciosas',
  '55': 'Publicaciones impresas y electrónicas',
  '56': 'Muebles, mobiliario y decoración',
  '60': 'Maquinaria y accesorios agrícolas',
  '70': 'Servicios de gestión y administración',
  '71': 'Servicios de minería, petróleo y gas',
  '72': 'Servicios de edificación, construcción',
  '73': 'Servicios industriales de producción',
  '76': 'Servicios de limpieza industrial',
  '77': 'Servicios medioambientales',
  '78': 'Servicios de transporte, almacenaje y correo',
  '80': 'Servicios de gestión, profesionales y administrativos',
  '81': 'Servicios basados en ingeniería e investigación',
  '82': 'Servicios de publicidad y marketing',
  '83': 'Servicios de utilidad pública',
  '84': 'Servicios financieros y de seguros',
  '85': 'Servicios de salud',
  '86': 'Servicios educativos',
  '90': 'Servicios de viaje, alimentación y alojamiento',
  '91': 'Servicios de aseo personal y doméstico',
  '92': 'Servicios de defensa y orden público',
  '93': 'Servicios políticos y cívicos',
  '94': 'Organizaciones y clubes',
  '95': 'Terrenos y edificaciones',
} as const;

/**
 * Validate an 8-digit SUNAT product code (Catálogo 62 — UNSPSC).
 *
 * Rules:
 * - Must be exactly 8 digits
 * - First 2 digits must be a valid top-level category from CODIGO_PRODUCTO_SUNAT_CATEGORIES
 *
 * @param code - The product code to validate
 * @returns true if valid, false otherwise
 */
export function isValidProductCode(code: string): boolean {
  if (!/^\d{8}$/.test(code)) return false;
  const category = code.substring(0, 2);
  return category in CODIGO_PRODUCTO_SUNAT_CATEGORIES;
}
