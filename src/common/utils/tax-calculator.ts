import { IGV_RATE, IVAP_RATE, ICBPER_RATE, TIPO_AFECTACION_IGV } from '../constants/index.js';

/**
 * Redondear a 2 decimales (SUNAT: redondeo matemático estándar)
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Redondear a 4 decimales (para valores unitarios)
 */
export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
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
      case '03': // Al Valor según precio de venta al público
        isc = round2(valorVenta * (input.tasaISC ?? 0));
        break;
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
  igv: number;
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
  let totalIgv = 0;
  let totalIgvGratuitas = 0;
  let totalIsc = 0;
  let totalIcbper = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const tipo = tiposAfectacion[i];

    if (isGratuita(tipo)) {
      opGratuitas += item.valorVenta;
      totalIgvGratuitas += item.igv;
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
  totalIgv = round2(totalIgv);
  totalIgvGratuitas = round2(totalIgvGratuitas);
  totalIsc = round2(totalIsc);
  totalIcbper = round2(totalIcbper);

  // When there's a descuento global, SUNAT requires IGV recalculation
  // on the net base (opGravadas - proportional discount).
  if (descuentoGlobal > 0 && opGravadas > 0) {
    const totalOperaciones = opGravadas + opExoneradas + opInafectas;
    if (totalOperaciones > 0) {
      const proporcionGravada = opGravadas / totalOperaciones;
      const descuentoGravado = round2(descuentoGlobal * proporcionGravada);
      opGravadas = round2(opGravadas - descuentoGravado);
      // Recalculate IGV on the reduced base
      totalIgv = round2(opGravadas * IGV_RATE);
    }
  }

  const totalVenta = round2(
    opGravadas + opExoneradas + opInafectas +
    totalIgv + totalIsc + totalIcbper +
    otrosCargos - descuentoGlobal,
  );

  return {
    opGravadas,
    opExoneradas,
    opInafectas,
    opGratuitas,
    igv: totalIgv,
    igvGratuitas: totalIgvGratuitas,
    isc: totalIsc,
    icbper: totalIcbper,
    otrosCargos: round2(otrosCargos),
    descuentoGlobal: round2(descuentoGlobal),
    totalVenta,
  };
}
