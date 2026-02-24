import {
  IGV_RATE,
  IVAP_RATE,
  ICBPER_RATE,
  TIPO_AFECTACION_IGV,
  DETRACCION_RATES,
  DETRACCION_THRESHOLD,
  DETRACCION_THRESHOLD_TRANSPORT,
} from '../constants/index.js';

/**
 * Redondear a N decimales usando aritmética de enteros.
 * Evita errores de punto flotante IEEE 754 que causan
 * rechazos SUNAT (errores 2508/2510).
 *
 * Método: convierte a string, desplaza el punto decimal,
 * trunca/redondea en enteros, y reconstruye.
 */
function safeRound(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  // Usar exponential notation para evitar errores de multiplicación flotante.
  // Ejemplo: round(1.005, 2) → Number('1.005e2') = 100.5 → Math.round = 101 → 101e-2 = 1.01
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}

/**
 * Redondear a 2 decimales (SUNAT: redondeo matemático estándar).
 * Usa notación exponencial para evitar errores de punto flotante.
 */
export function round2(value: number): number {
  return safeRound(value, 2);
}

/**
 * Redondear a 4 decimales (para valores unitarios).
 * Usa notación exponencial para evitar errores de punto flotante.
 */
export function round4(value: number): number {
  return safeRound(value, 4);
}

/**
 * Determinar si un tipo de afectación es gravado con IGV
 */
export function isGravado(tipoAfectacion: string): boolean {
  const code = parseInt(tipoAfectacion, 10);
  return code >= 10 && code < 20;
}

/**
 * Determinar si es exonerado
 */
export function isExonerado(tipoAfectacion: string): boolean {
  const code = parseInt(tipoAfectacion, 10);
  return code >= 20 && code < 30;
}

/**
 * Determinar si es inafecto
 */
export function isInafecto(tipoAfectacion: string): boolean {
  const code = parseInt(tipoAfectacion, 10);
  return code >= 30 && code < 40;
}

/**
 * Determinar si es exportación
 */
export function isExportacion(tipoAfectacion: string): boolean {
  return tipoAfectacion === TIPO_AFECTACION_IGV.EXPORTACION;
}

/**
 * Determinar si es IVAP (tipo 17 — Arroz Pilado, tasa 4%)
 */
export function isIvap(tipoAfectacion: string): boolean {
  return tipoAfectacion === TIPO_AFECTACION_IGV.GRAVADO_IVAP;
}

/**
 * Determinar si es operación gratuita (retiro, bonificación, etc.)
 * Tipo 17 (IVAP) es oneroso, NO gratuita.
 */
export function isGratuita(tipoAfectacion: string): boolean {
  const code = parseInt(tipoAfectacion, 10);
  return (
    (code >= 11 && code <= 16) ||
    code === 21 ||
    (code >= 31 && code <= 36)
  );
}

export interface ItemCalcInput {
  cantidad: number;
  valorUnitario: number; // precio sin IGV
  tipoAfectacion: string; // catálogo 07
  descuento?: number; // monto descuento
  isc?: number; // monto ISC pre-calculado (takes precedence)
  /** ISC calculation system: '01'=Al Valor, '02'=Específico, '03'=Al Valor según precio de venta al público */
  tipoSistemaISC?: '01' | '02' | '03';
  /** ISC rate (for tipoSistemaISC '01' or '03') e.g. 0.30 for 30% */
  tasaISC?: number;
  /** ISC fixed amount per unit (for tipoSistemaISC '02') */
  montoFijoISC?: number;
  cantidadBolsasPlastico?: number; // para ICBPER
}

export interface ItemCalcResult {
  valorUnitario: number;    // 4 decimales
  precioUnitario: number;   // 4 decimales (con IGV si gravado)
  valorVenta: number;       // 2 decimales
  igv: number;              // 2 decimales
  isc: number;              // 2 decimales
  icbper: number;           // 2 decimales
  descuento: number;        // 2 decimales
  totalItem: number;        // 2 decimales (valorVenta + igv + isc + icbper - descuento)
}

/**
 * Calcular impuestos de un ítem de factura
 */
export function calculateItemTaxes(input: ItemCalcInput): ItemCalcResult {
  const {
    cantidad,
    valorUnitario,
    tipoAfectacion,
    descuento = 0,
    cantidadBolsasPlastico = 0,
  } = input;

  const valorVenta = round2(cantidad * valorUnitario - descuento);

  // ISC calculation: use pre-calculated isc if provided, else auto-calculate
  let isc = input.isc ?? 0;
  if (input.isc === undefined && input.tipoSistemaISC) {
    switch (input.tipoSistemaISC) {
      case '01': // Al Valor (porcentaje sobre valorVenta)
        isc = round2(valorVenta * (input.tasaISC ?? 0));
        break;
      case '02': // Específico (monto fijo por unidad)
        isc = round2(cantidad * (input.montoFijoISC ?? 0));
        break;
      case '03': { // Al Valor según precio de venta al público
        const tasa = input.tasaISC ?? 0;
        isc = tasa > 0 ? round2(valorVenta * tasa / (1 + tasa)) : 0;
        break;
      }
    }
  }

  const baseImponible = valorVenta + isc;

  let igv = 0;
  let precioUnitario = round4(valorUnitario);

  if (isGravado(tipoAfectacion)) {
    const rate = isIvap(tipoAfectacion) ? IVAP_RATE : IGV_RATE;
    igv = round2(baseImponible * rate);
    precioUnitario = round4(valorUnitario * (1 + rate));
  }

  const icbper = round2(cantidadBolsasPlastico * ICBPER_RATE);
  const totalItem = round2(valorVenta + igv + isc + icbper);

  return {
    valorUnitario: round4(valorUnitario),
    precioUnitario,
    valorVenta,
    igv,
    isc: round2(isc),
    icbper,
    descuento: round2(descuento),
    totalItem,
  };
}

export interface InvoiceTotalsInput {
  items: ItemCalcResult[];
  tiposAfectacion: string[]; // paralelo a items
  descuentoGlobal?: number;
  otrosCargos?: number;
}

export interface InvoiceTotals {
  opGravadas: number;
  opExoneradas: number;
  opInafectas: number;
  opGratuitas: number;
  /** IVAP base amount (tipo 17) — tracked separately from opGravadas for XML TaxSubtotal */
  opIvap: number;
  igv: number;
  /** IVAP tax amount (4%) — tracked separately from igv for XML TaxSubtotal with code 1016 */
  igvIvap: number;
  igvGratuitas: number;
  isc: number;
  icbper: number;
  otrosCargos: number;
  descuentoGlobal: number;
  totalVenta: number;
}

/**
 * Calcular totales de factura
 */
export function calculateInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const { items, tiposAfectacion, descuentoGlobal = 0, otrosCargos = 0 } = input;

  let opGravadas = 0;
  let opExoneradas = 0;
  let opInafectas = 0;
  let opGratuitas = 0;
  let opIvap = 0;
  let totalIgv = 0;
  let totalIgvIvap = 0;
  let totalIgvGratuitas = 0;
  let totalIsc = 0;
  let totalIcbper = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const tipo = tiposAfectacion[i];

    if (isGratuita(tipo)) {
      opGratuitas += item.valorVenta;
      totalIgvGratuitas += item.igv;
    } else if (isIvap(tipo)) {
      // IVAP (tipo 17) tracked separately for XML TaxSubtotal with code 1016
      opIvap += item.valorVenta;
      totalIgvIvap += item.igv;
    } else if (isGravado(tipo)) {
      opGravadas += item.valorVenta;
      totalIgv += item.igv;
    } else if (isExonerado(tipo)) {
      opExoneradas += item.valorVenta;
    } else if (isInafecto(tipo) || isExportacion(tipo)) {
      opInafectas += item.valorVenta;
    }

    totalIsc += item.isc;
    totalIcbper += item.icbper;
  }

  opGravadas = round2(opGravadas);
  opExoneradas = round2(opExoneradas);
  opInafectas = round2(opInafectas);
  opGratuitas = round2(opGratuitas);
  opIvap = round2(opIvap);
  totalIgv = round2(totalIgv);
  totalIgvIvap = round2(totalIgvIvap);
  totalIgvGratuitas = round2(totalIgvGratuitas);
  totalIsc = round2(totalIsc);
  totalIcbper = round2(totalIcbper);

  // SUNAT rule: Document-level TaxTotal IGV MUST equal the sum of
  // line-level IGV amounts. The global discount (AllowanceCharge code '02')
  // is declared separately in the XML and reduces only the PayableAmount.
  // We do NOT recalculate IGV on a net base — that would cause the document
  // IGV to diverge from the sum of line IGVs, triggering error 2510.

  const totalVenta = round2(
    opGravadas + opIvap + opExoneradas + opInafectas +
    totalIgv + totalIgvIvap + totalIsc + totalIcbper +
    otrosCargos - descuentoGlobal,
  );

  return {
    opGravadas,
    opExoneradas,
    opInafectas,
    opGratuitas,
    opIvap,
    igv: totalIgv,
    igvIvap: totalIgvIvap,
    igvGratuitas: totalIgvGratuitas,
    isc: totalIsc,
    icbper: totalIcbper,
    otrosCargos: round2(otrosCargos),
    descuentoGlobal: round2(descuentoGlobal),
    totalVenta,
  };
}

// ─── Detracción Helpers ──────────────────────────────────────────────────

/**
 * Get the official SUNAT detracción rate for a given commodity/service code.
 * Returns undefined if the code is not in Catálogo 54.
 */
export function getDetraccionRate(codigo: string): number | undefined {
  return DETRACCION_RATES[codigo];
}

/**
 * Calculate the detracción amount based on the official SUNAT rate.
 * Returns 0 if the code is not recognized.
 */
export function calculateDetraccionAmount(codigo: string, totalVenta: number): number {
  const rate = DETRACCION_RATES[codigo];
  if (!rate) return 0;
  return round2(totalVenta * rate);
}

/**
 * Check if detracción is required based on the total amount and commodity code.
 * Uses SUNAT threshold rules:
 * - Transport (027): >= S/400
 * - All others: >= S/700
 */
export function isDetraccionRequired(totalVenta: number, codigo: string): boolean {
  const threshold = codigo === '027' ? DETRACCION_THRESHOLD_TRANSPORT : DETRACCION_THRESHOLD;
  return totalVenta >= threshold;
}
