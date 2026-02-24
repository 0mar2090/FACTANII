// ═══════════════════════════════════════════════════════════════════
// XML Validator — Pre-send validation against SUNAT rules
// ═══════════════════════════════════════════════════════════════════

import { Injectable, BadRequestException } from '@nestjs/common';
import {
  TIPO_DOCUMENTO,
  TIPO_DOC_IDENTIDAD,
  TIPO_AFECTACION_IGV,
  MOTIVO_NOTA_CREDITO,
  MOTIVO_NOTA_DEBITO,
  MOTIVO_TRASLADO,
  MODALIDAD_TRANSPORTE,
  REGIMEN_RETENCION,
  REGIMEN_PERCEPCION,
  TIPO_MONEDA,
  IGV_RATE,
  MAX_DAYS_TO_SEND,
  MAX_DAYS_BY_DOC_TYPE,
  CODIGO_DETRACCION,
  DETRACCION_THRESHOLD,
  DETRACCION_THRESHOLD_TRANSPORT,
} from '../../../common/constants/index.js';
import { round2, calculateItemTaxes, calculateInvoiceTotals } from '../../../common/utils/tax-calculator.js';
import { peruToday, daysBetweenInPeru } from '../../../common/utils/peru-date.js';
import type { CreateInvoiceDto } from '../../invoices/dto/create-invoice.dto.js';
import type { CreateCreditNoteDto } from '../../invoices/dto/create-credit-note.dto.js';
import type { CreateDebitNoteDto } from '../../invoices/dto/create-debit-note.dto.js';
import type { CreateRetentionDto } from '../../invoices/dto/create-retention.dto.js';
import type { CreatePerceptionDto } from '../../invoices/dto/create-perception.dto.js';
import type { CreateGuideDto } from '../../invoices/dto/create-guide.dto.js';
import type { CreateSummaryDto } from '../../invoices/dto/create-summary.dto.js';
import type { CreateVoidedDto } from '../../invoices/dto/create-voided.dto.js';

/** A validation error with field and message */
interface ValidationError {
  field: string;
  message: string;
}

/**
 * Pre-send validator for SUNAT electronic documents.
 *
 * Validates business rules that go beyond DTO field-level validation
 * (class-validator handles format/type). This validator enforces
 * SUNAT-specific rules such as:
 *
 * - RUC required for facturas
 * - Date within allowed sending window
 * - Valid motivo codes for notes
 * - IGV tolerance check
 * - Currency consistency
 * - Client document type rules per document type
 */
@Injectable()
export class XmlValidatorService {
  /**
   * Validate a Factura (01) or Boleta (03) before XML generation.
   *
   * @throws BadRequestException if validation fails
   */
  validateInvoice(dto: CreateInvoiceDto): void {
    const errors: ValidationError[] = [];
    const tipoDoc = dto.tipoDoc;

    // Factura (01) requires RUC (tipo doc 6)
    if (tipoDoc === TIPO_DOCUMENTO.FACTURA) {
      if (dto.clienteTipoDoc !== TIPO_DOC_IDENTIDAD.RUC) {
        errors.push({
          field: 'clienteTipoDoc',
          message: 'Factura requires client with RUC (tipo documento 6)',
        });
      }

      if (dto.clienteNumDoc && dto.clienteNumDoc.length !== 11) {
        errors.push({
          field: 'clienteNumDoc',
          message: 'RUC must be exactly 11 digits',
        });
      }
    }

    // Boleta (03) — DNI or no document for amounts < 700
    if (tipoDoc === TIPO_DOCUMENTO.BOLETA) {
      const validBoletaDocTypes = [
        TIPO_DOC_IDENTIDAD.DNI,
        TIPO_DOC_IDENTIDAD.NO_DOMICILIADO,
        TIPO_DOC_IDENTIDAD.CARNET_EXTRANJERIA,
        TIPO_DOC_IDENTIDAD.PASAPORTE,
        TIPO_DOC_IDENTIDAD.OTROS,
      ];
      if (!validBoletaDocTypes.includes(dto.clienteTipoDoc as any)) {
        errors.push({
          field: 'clienteTipoDoc',
          message: 'Boleta cannot use RUC as client document type',
        });
      }

      // Boletas > S/700 require client identification (SUNAT rule)
      // Use proper tax calculation functions for accurate total estimation.
      const itemResults = dto.items.map(item => calculateItemTaxes({
        cantidad: item.cantidad ?? 0,
        valorUnitario: item.valorUnitario ?? 0,
        tipoAfectacion: item.tipoAfectacion ?? '10',
        descuento: item.descuento,
        isc: item.isc,
        cantidadBolsasPlastico: item.cantidadBolsasPlastico,
      }));
      const tiposAfectacion = dto.items.map(i => i.tipoAfectacion ?? '10');
      const totals = calculateInvoiceTotals({
        items: itemResults,
        tiposAfectacion,
        descuentoGlobal: dto.descuentoGlobal,
        otrosCargos: dto.otrosCargos,
      });
      const estimatedTotal = totals.totalVenta;

      if (estimatedTotal > 700) {
        const anonymousDocTypes = [TIPO_DOC_IDENTIDAD.OTROS, TIPO_DOC_IDENTIDAD.NO_DOMICILIADO];
        const isAnonymous = anonymousDocTypes.includes(dto.clienteTipoDoc as any)
          || !dto.clienteNumDoc || dto.clienteNumDoc.trim() === '';

        if (isAnonymous) {
          errors.push({
            field: 'clienteNumDoc',
            message: 'Boleta over S/700 requires client identification (DNI, CE, or passport)',
          });
        }
      }
    }

    // Validate emission date (per document type window)
    this.validateEmissionDate(dto.fechaEmision, errors, tipoDoc);

    // Validate currency
    this.validateCurrency(dto.moneda ?? 'PEN', errors);

    // Validate items
    this.validateItems(dto.items, errors);

    // Validate credit payment terms
    if (dto.formaPago === 'Credito') {
      if (!dto.cuotas || dto.cuotas.length === 0) {
        errors.push({
          field: 'cuotas',
          message: 'Credit payment requires at least one installment (cuota)',
        });
      }
    }

    // Validate detracción (SPOT)
    const tipoOp = dto.tipoOperacion ?? '0101';
    if (tipoOp === '1001') {
      if (!dto.codigoDetraccion) {
        errors.push({
          field: 'codigoDetraccion',
          message: 'Detracción code is required when tipoOperacion is 1001',
        });
      }
      if (!dto.porcentajeDetraccion || dto.porcentajeDetraccion <= 0) {
        errors.push({
          field: 'porcentajeDetraccion',
          message: 'Detracción percentage must be greater than zero',
        });
      }
      if (!dto.montoDetraccion || dto.montoDetraccion <= 0) {
        errors.push({
          field: 'montoDetraccion',
          message: 'Detracción amount must be greater than zero',
        });
      }
      if (!dto.cuentaDetraccion || dto.cuentaDetraccion.trim() === '') {
        errors.push({
          field: 'cuentaDetraccion',
          message: 'Banco de la Nación account is required for detracción',
        });
      }
    }

    // Validate detracción code against catalog 54
    if (dto.codigoDetraccion) {
      const validCodes = Object.values(CODIGO_DETRACCION);
      if (!validCodes.includes(dto.codigoDetraccion as any)) {
        errors.push({
          field: 'codigoDetraccion',
          message: `Invalid detracción code. Must be a valid SUNAT catalog 54 code`,
        });
      }
    }

    // Export invoices: all items must have tipoAfectacion '40'
    const exportOps = ['0200', '0201', '0202', '0203', '0204', '0205', '0206', '0207', '0208'];
    if (exportOps.includes(tipoOp)) {
      for (const [idx, item] of (dto.items || []).entries()) {
        if ((item.tipoAfectacion ?? '10') !== '40') {
          errors.push({
            field: `items[${idx}].tipoAfectacion`,
            message: `Factura de exportación requiere tipoAfectacion '40', item ${idx} tiene '${item.tipoAfectacion ?? '10'}'`,
          });
        }
      }
    }

    // --- Deep validations (SUNAT Feb 2026) ---

    // Compute totals from items for cross-checks
    const deepItemResults = (dto.items || []).map(item => calculateItemTaxes({
      cantidad: item.cantidad ?? 0,
      valorUnitario: item.valorUnitario ?? 0,
      tipoAfectacion: item.tipoAfectacion ?? '10',
      descuento: item.descuento,
      isc: item.isc,
      cantidadBolsasPlastico: item.cantidadBolsasPlastico,
    }));
    const deepTiposAfectacion = (dto.items || []).map(i => i.tipoAfectacion ?? '10');
    const deepTotals = calculateInvoiceTotals({
      items: deepItemResults,
      tiposAfectacion: deepTiposAfectacion,
      descuentoGlobal: dto.descuentoGlobal,
      otrosCargos: dto.otrosCargos,
    });

    // Product code validation (OBS-3496): if codigoSunat provided, must be 8-digit numeric, not 00000000/99999999
    for (let idx = 0; idx < (dto.items || []).length; idx++) {
      const item = dto.items[idx]!;
      if (item.codigoSunat) {
        if (!/^\d{8}$/.test(item.codigoSunat)) {
          errors.push({
            field: `items[${idx}].codigoSunat`,
            message: `codigoSunat debe ser numérico de 8 dígitos, recibido: ${item.codigoSunat}`,
          });
        } else if (item.codigoSunat === '00000000' || item.codigoSunat === '99999999') {
          errors.push({
            field: `items[${idx}].codigoSunat`,
            message: `codigoSunat no puede ser 00000000 ni 99999999`,
          });
        }
      }
    }

    // Detracción threshold: totalVenta must meet minimum (S/700 general, S/400 transport code 027)
    if (dto.codigoDetraccion) {
      const threshold = dto.codigoDetraccion === '027' ? DETRACCION_THRESHOLD_TRANSPORT : DETRACCION_THRESHOLD;
      if (deepTotals.totalVenta < threshold) {
        errors.push({
          field: 'totalVenta',
          message: `Factura con detracción requiere monto mínimo de S/${threshold} (umbral SUNAT). Total actual: S/${deepTotals.totalVenta}`,
        });
      }
    }

    // Anticipos validation
    if (dto.anticipos && dto.anticipos.length > 0) {
      const sumAnticipos = dto.anticipos.reduce((acc: number, a) => acc + (a.monto || 0), 0);
      if (sumAnticipos > deepTotals.totalVenta) {
        errors.push({
          field: 'anticipos',
          message: `Suma de anticipos (${sumAnticipos}) excede el total de venta (${deepTotals.totalVenta})`,
        });
      }
      const invoiceMoneda = dto.moneda ?? 'PEN';
      for (let idx = 0; idx < dto.anticipos.length; idx++) {
        const anticipo = dto.anticipos[idx]!;
        if (anticipo.moneda && anticipo.moneda !== invoiceMoneda) {
          errors.push({
            field: `anticipos[${idx}].moneda`,
            message: `Anticipo moneda (${anticipo.moneda}) debe coincidir con moneda de factura (${invoiceMoneda})`,
          });
        }
      }
    }

    this.throwIfErrors(errors);
  }

  /**
   * Validate a Nota de Crédito (07) before XML generation.
   *
   * @throws BadRequestException if validation fails
   */
  validateCreditNote(dto: CreateCreditNoteDto): void {
    const errors: ValidationError[] = [];

    // Validate motivo nota
    const validMotivos = Object.values(MOTIVO_NOTA_CREDITO);
    if (!validMotivos.includes(dto.motivoNota as any)) {
      errors.push({
        field: 'motivoNota',
        message: `Invalid credit note reason code. Valid codes: ${validMotivos.join(', ')}`,
      });
    }

    // Validate reference document type
    if (dto.docRefTipo !== TIPO_DOCUMENTO.FACTURA && dto.docRefTipo !== TIPO_DOCUMENTO.BOLETA) {
      errors.push({
        field: 'docRefTipo',
        message: 'Reference document must be Factura (01) or Boleta (03)',
      });
    }

    // Factura reference requires RUC client
    if (dto.docRefTipo === TIPO_DOCUMENTO.FACTURA) {
      if (dto.clienteTipoDoc !== TIPO_DOC_IDENTIDAD.RUC) {
        errors.push({
          field: 'clienteTipoDoc',
          message: 'Credit note referencing a Factura requires client with RUC',
        });
      }
    }

    // Validate emission date
    this.validateEmissionDate(dto.fechaEmision, errors, TIPO_DOCUMENTO.NOTA_CREDITO);

    // Validate currency
    this.validateCurrency(dto.moneda ?? 'PEN', errors);

    // Validate items
    this.validateItems(dto.items, errors);

    // Validate motivo description
    if (!dto.motivoDescripcion || dto.motivoDescripcion.trim().length === 0) {
      errors.push({
        field: 'motivoDescripcion',
        message: 'Credit note reason description is required',
      });
    }

    // NC motivo 13 (corrección de monto): total cannot exceed original document total
    if (dto.motivoNota === '13' && dto.montoOriginal !== undefined) {
      const estimatedTotal = round2(dto.items.reduce((sum, item) => {
        const qty = item.cantidad ?? 0;
        const unit = item.valorUnitario ?? 0;
        return sum + qty * unit;
      }, 0));

      if (estimatedTotal > dto.montoOriginal) {
        errors.push({
          field: 'items',
          message: `Credit note amount (${estimatedTotal}) exceeds the original document amount (${dto.montoOriginal}) for motivo 13`,
        });
      }
    }

    this.throwIfErrors(errors);
  }

  /**
   * Validate a Nota de Débito (08) before XML generation.
   *
   * @throws BadRequestException if validation fails
   */
  validateDebitNote(dto: CreateDebitNoteDto): void {
    const errors: ValidationError[] = [];

    // Validate motivo nota
    const validMotivos = Object.values(MOTIVO_NOTA_DEBITO);
    if (!validMotivos.includes(dto.motivoNota as any)) {
      errors.push({
        field: 'motivoNota',
        message: `Invalid debit note reason code. Valid codes: ${validMotivos.join(', ')}`,
      });
    }

    // Validate reference document type
    if (dto.docRefTipo !== TIPO_DOCUMENTO.FACTURA && dto.docRefTipo !== TIPO_DOCUMENTO.BOLETA) {
      errors.push({
        field: 'docRefTipo',
        message: 'Reference document must be Factura (01) or Boleta (03)',
      });
    }

    // Factura reference requires RUC client
    if (dto.docRefTipo === TIPO_DOCUMENTO.FACTURA) {
      if (dto.clienteTipoDoc !== TIPO_DOC_IDENTIDAD.RUC) {
        errors.push({
          field: 'clienteTipoDoc',
          message: 'Debit note referencing a Factura requires client with RUC',
        });
      }
    }

    // Validate emission date
    this.validateEmissionDate(dto.fechaEmision, errors, TIPO_DOCUMENTO.NOTA_DEBITO);

    // Validate currency
    this.validateCurrency(dto.moneda ?? 'PEN', errors);

    // Validate items
    this.validateItems(dto.items, errors);

    // Validate motivo description
    if (!dto.motivoDescripcion || dto.motivoDescripcion.trim().length === 0) {
      errors.push({
        field: 'motivoDescripcion',
        message: 'Debit note reason description is required',
      });
    }

    this.throwIfErrors(errors);
  }

  /**
   * Validate a Comprobante de Retención (20) before XML generation.
   *
   * @throws BadRequestException if validation fails
   */
  validateRetention(dto: CreateRetentionDto): void {
    const errors: ValidationError[] = [];

    // Validate regime
    const validRegimes = Object.values(REGIMEN_RETENCION);
    if (!validRegimes.includes(dto.regimenRetencion as any)) {
      errors.push({
        field: 'regimenRetencion',
        message: `Invalid retention regime. Valid codes: ${validRegimes.join(', ')}`,
      });
    }

    // Proveedor must have RUC
    if (dto.proveedorTipoDoc !== TIPO_DOC_IDENTIDAD.RUC) {
      errors.push({
        field: 'proveedorTipoDoc',
        message: 'Retention documents require a provider with RUC (tipo documento 6)',
      });
    }

    if (dto.proveedorNumDoc && dto.proveedorNumDoc.length !== 11) {
      errors.push({
        field: 'proveedorNumDoc',
        message: 'RUC must be exactly 11 digits',
      });
    }

    // Validate emission date (CRE: 9-day window)
    this.validateEmissionDate(dto.fechaEmision, errors, TIPO_DOCUMENTO.RETENCION);

    // Validate items
    if (!dto.items || dto.items.length === 0) {
      errors.push({
        field: 'items',
        message: 'At least one retention item is required',
      });
    } else {
      // Retention only applies to Facturas (tipo doc '01')
      const validRetentionDocTypes = ['01'];
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i]!;
        if (item.importeTotal <= 0) {
          errors.push({
            field: `items[${i}].importeTotal`,
            message: 'Document amount must be greater than zero',
          });
        }
        // tipoDocRelacionado must be '01' (facturas only for retention)
        if (!validRetentionDocTypes.includes(item.tipoDocRelacionado)) {
          errors.push({
            field: `items[${i}].tipoDocRelacionado`,
            message: `Retention only applies to Facturas (01). Received: ${item.tipoDocRelacionado}`,
          });
        }
        // Validate date strings
        if (!this.isValidDateString(item.fechaDoc)) {
          errors.push({
            field: `items[${i}].fechaDoc`,
            message: 'Invalid date format for fechaDoc. Expected YYYY-MM-DD',
          });
        }
        if (!this.isValidDateString(item.fechaPago)) {
          errors.push({
            field: `items[${i}].fechaPago`,
            message: 'Invalid date format for fechaPago. Expected YYYY-MM-DD',
          });
        }
        // tipoCambio is required when moneda is not PEN
        if (item.moneda && item.moneda !== 'PEN' && !item.tipoCambio) {
          errors.push({
            field: `items[${i}].tipoCambio`,
            message: 'Exchange rate (tipoCambio) is required for foreign currency',
          });
        }
      }
    }

    // Validate fechaEmision is a valid date string
    if (!this.isValidDateString(dto.fechaEmision)) {
      errors.push({
        field: 'fechaEmision',
        message: 'Invalid date format for fechaEmision. Expected YYYY-MM-DD',
      });
    }

    this.throwIfErrors(errors);
  }

  /**
   * Validate a Comprobante de Percepción (40) before XML generation.
   *
   * @throws BadRequestException if validation fails
   */
  validatePerception(dto: CreatePerceptionDto): void {
    const errors: ValidationError[] = [];

    // Validate regime
    const validRegimes = Object.values(REGIMEN_PERCEPCION);
    if (!validRegimes.includes(dto.regimenPercepcion as any)) {
      errors.push({
        field: 'regimenPercepcion',
        message: `Invalid perception regime. Valid codes: ${validRegimes.join(', ')}`,
      });
    }

    // Cliente must be identified
    if (!dto.clienteNumDoc || dto.clienteNumDoc.trim() === '') {
      errors.push({
        field: 'clienteNumDoc',
        message: 'Client document number is required for perception documents',
      });
    }

    // Validate emission date (CPE: 9-day window)
    this.validateEmissionDate(dto.fechaEmision, errors, TIPO_DOCUMENTO.PERCEPCION);

    // Validate items
    if (!dto.items || dto.items.length === 0) {
      errors.push({
        field: 'items',
        message: 'At least one perception item is required',
      });
    } else {
      // Perception applies to Facturas (01), Boletas (03), and Liquidación de Compra (12)
      const validPerceptionDocTypes = ['01', '03', '12'];
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i]!;
        if (item.importeTotal <= 0) {
          errors.push({
            field: `items[${i}].importeTotal`,
            message: 'Document amount must be greater than zero',
          });
        }
        // tipoDocRelacionado must be '01', '03', or '12'
        if (!validPerceptionDocTypes.includes(item.tipoDocRelacionado)) {
          errors.push({
            field: `items[${i}].tipoDocRelacionado`,
            message: `Perception applies to Facturas (01), Boletas (03), or Liquidación de Compra (12). Received: ${item.tipoDocRelacionado}`,
          });
        }
        // Validate date strings
        if (!this.isValidDateString(item.fechaDoc)) {
          errors.push({
            field: `items[${i}].fechaDoc`,
            message: 'Invalid date format for fechaDoc. Expected YYYY-MM-DD',
          });
        }
        if (!this.isValidDateString(item.fechaCobro)) {
          errors.push({
            field: `items[${i}].fechaCobro`,
            message: 'Invalid date format for fechaCobro. Expected YYYY-MM-DD',
          });
        }
        // tipoCambio is required when moneda is not PEN
        if (item.moneda && item.moneda !== 'PEN' && !item.tipoCambio) {
          errors.push({
            field: `items[${i}].tipoCambio`,
            message: 'Exchange rate (tipoCambio) is required for foreign currency',
          });
        }
      }
    }

    // Validate fechaEmision is a valid date string
    if (!this.isValidDateString(dto.fechaEmision)) {
      errors.push({
        field: 'fechaEmision',
        message: 'Invalid date format for fechaEmision. Expected YYYY-MM-DD',
      });
    }

    this.throwIfErrors(errors);
  }

  /**
   * Validate a Guía de Remisión (09) before XML generation.
   *
   * @throws BadRequestException if validation fails
   */
  validateGuide(dto: CreateGuideDto): void {
    const errors: ValidationError[] = [];

    // Validate motivo de traslado
    const validMotivos = Object.values(MOTIVO_TRASLADO);
    if (!validMotivos.includes(dto.motivoTraslado as any)) {
      errors.push({
        field: 'motivoTraslado',
        message: `Invalid transfer reason. Valid codes: ${validMotivos.join(', ')}`,
      });
    }

    // When motivo is Venta ('01'), docReferencia is required
    if (dto.motivoTraslado === MOTIVO_TRASLADO.VENTA && !dto.docReferencia) {
      errors.push({
        field: 'docReferencia',
        message: 'Document reference is required when transfer reason is Venta (01)',
      });
    }

    // Validate modalidad de transporte
    const validModalidades = Object.values(MODALIDAD_TRANSPORTE);
    if (!validModalidades.includes(dto.modalidadTransporte as any)) {
      errors.push({
        field: 'modalidadTransporte',
        message: `Invalid transport mode. Valid codes: ${validModalidades.join(', ')}`,
      });
    }

    // Peso must be positive
    if (dto.pesoTotal <= 0) {
      errors.push({
        field: 'pesoTotal',
        message: 'Total weight must be greater than zero',
      });
    }

    // Addresses must be complete with valid 6-digit ubigeo
    const ubigeoRegex = /^\d{6}$/;

    if (!dto.puntoPartida?.ubigeo || !dto.puntoPartida?.direccion) {
      errors.push({
        field: 'puntoPartida',
        message: 'Origin address with ubigeo and direccion is required',
      });
    } else if (!ubigeoRegex.test(dto.puntoPartida.ubigeo)) {
      errors.push({
        field: 'puntoPartida.ubigeo',
        message: 'Ubigeo must be exactly 6 digits',
      });
    }

    if (!dto.puntoLlegada?.ubigeo || !dto.puntoLlegada?.direccion) {
      errors.push({
        field: 'puntoLlegada',
        message: 'Destination address with ubigeo and direccion is required',
      });
    } else if (!ubigeoRegex.test(dto.puntoLlegada.ubigeo)) {
      errors.push({
        field: 'puntoLlegada.ubigeo',
        message: 'Ubigeo must be exactly 6 digits',
      });
    }

    // If public transport, transportista is required
    if (dto.modalidadTransporte === MODALIDAD_TRANSPORTE.TRANSPORTE_PUBLICO) {
      if (!dto.transportista) {
        errors.push({
          field: 'transportista',
          message: 'Carrier (transportista) is required for public transport mode',
        });
      }
    }

    // For any transport mode, at least one conductor is needed
    const hasConductor = dto.conductor || (dto.conductores && dto.conductores.length > 0);
    if (!hasConductor) {
      errors.push({
        field: 'conductor',
        message: 'At least one conductor (driver) is required',
      });
    }

    // For private transport, vehicle is required (unless M1/L indicator is set)
    if (dto.modalidadTransporte === MODALIDAD_TRANSPORTE.TRANSPORTE_PRIVADO) {
      if (!dto.indicadorM1L) {
        if (dto.conductor && !dto.conductor.licencia) {
          errors.push({
            field: 'conductor.licencia',
            message: 'Driver license (licencia) is required for private transport mode (unless indicadorM1L is true)',
          });
        }
        // Validate all conductores have licencia for private transport
        if (dto.conductores) {
          for (let i = 0; i < dto.conductores.length; i++) {
            if (!dto.conductores[i]!.licencia) {
              errors.push({
                field: `conductores[${i}].licencia`,
                message: 'Driver license (licencia) is required for private transport mode (unless indicadorM1L is true)',
              });
            }
          }
        }
        if (!dto.vehiculo) {
          errors.push({
            field: 'vehiculo',
            message: 'Vehicle (placa) is required for private transport (modalidad 02)',
          });
        }
      }
    }

    // Validate vehicle plate format (Peru: ABC-123 or ABC-1234)
    if (dto.vehiculo?.placa && !/^[A-Z0-9]{3}-[A-Z0-9]{3,4}$/i.test(dto.vehiculo.placa)) {
      errors.push({
        field: 'vehiculo.placa',
        message: 'Invalid vehicle plate format (expected: ABC-123 or ABC-1234)',
      });
    }

    // Validate emission date (GRE: 7-day window)
    this.validateEmissionDate(dto.fechaEmision, errors, TIPO_DOCUMENTO.GUIA_REMISION_REMITENTE);

    // SUNAT requires fechaTraslado >= fechaEmision (code 4273)
    if (dto.fechaTraslado && dto.fechaEmision) {
      const traslado = new Date(dto.fechaTraslado);
      const emision = new Date(dto.fechaEmision);
      traslado.setHours(0, 0, 0, 0);
      emision.setHours(0, 0, 0, 0);
      if (traslado < emision) {
        errors.push({
          field: 'fechaTraslado',
          message: 'Transfer date must be equal to or later than emission date',
        });
      }
    }

    // Validate items
    if (!dto.items || dto.items.length === 0) {
      errors.push({
        field: 'items',
        message: 'At least one item is required',
      });
    } else {
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i]!;
        if (item.cantidad <= 0) {
          errors.push({
            field: `items[${i}].cantidad`,
            message: 'Quantity must be greater than zero',
          });
        }
        if (!item.descripcion || item.descripcion.trim().length === 0) {
          errors.push({
            field: `items[${i}].descripcion`,
            message: 'Item description is required',
          });
        }
      }
    }

    this.throwIfErrors(errors);
  }

  /**
   * Validate a Resumen Diario (RC) before XML generation.
   *
   * Business rules:
   * - fechaReferencia must be <= fechaEmision
   * - fechaReferencia must not be more than 3 days before fechaEmision
   * - NC/ND lines (07/08) require docReferencia fields
   *
   * @throws BadRequestException if validation fails
   */
  validateSummary(dto: CreateSummaryDto): void {
    const errors: ValidationError[] = [];

    const fechaEmision = dto.fechaEmision ?? peruToday();

    // fechaReferencia must be <= fechaEmision
    const ref = new Date(dto.fechaReferencia);
    const emi = new Date(fechaEmision);
    ref.setHours(0, 0, 0, 0);
    emi.setHours(0, 0, 0, 0);

    if (ref > emi) {
      errors.push({
        field: 'fechaReferencia',
        message: 'Reference date (fechaReferencia) cannot be after emission date',
      });
    }

    // fechaReferencia must not be in the future and must be within 7 days of today (Peru time)
    const diffDays = daysBetweenInPeru(dto.fechaReferencia);
    if (diffDays < 0) {
      errors.push({
        field: 'fechaReferencia',
        message: 'Reference date (fechaReferencia) cannot be in the future',
      });
    } else if (diffDays > 7) {
      errors.push({
        field: 'fechaReferencia',
        message: `Reference date (fechaReferencia) exceeds the 7-day window. It is ${diffDays} days ago.`,
      });
    }

    // Validate each summary line
    if (dto.items) {
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i]!;

        // NC/ND items require document reference
        if ((item.tipoDoc === '07' || item.tipoDoc === '08') && !item.docRefTipo) {
          errors.push({
            field: `items[${i}].docRefTipo`,
            message: 'NC/ND items in a summary require a document reference (docRefTipo)',
          });
        }

        // totalVenta consistency: opGravadas + opExoneradas + opInafectas + igv + isc + icbper + otrosCargos ≈ totalVenta (±1 tolerance)
        const expectedTotal =
          item.opGravadas + item.opExoneradas + item.opInafectas +
          item.igv + (item.isc ?? 0) + (item.icbper ?? 0) + (item.otrosCargos ?? 0);
        if (Math.abs(expectedTotal - item.totalVenta) > 1) {
          errors.push({
            field: `items[${i}].totalVenta`,
            message: `Total venta (${item.totalVenta}) does not match calculated total (${expectedTotal.toFixed(2)}). Difference exceeds ±1 tolerance.`,
          });
        }
      }
    }

    this.throwIfErrors(errors);
  }

  /**
   * Validate a Comunicación de Baja (RA) before XML generation.
   *
   * Business rules:
   * - fechaReferencia must be <= fechaEmision
   * - Only certain document types can be voided (01, 03, 07, 08)
   * - motivo (reason) must not be empty
   *
   * @throws BadRequestException if validation fails
   */
  validateVoided(dto: CreateVoidedDto): void {
    const errors: ValidationError[] = [];

    const fechaEmision = dto.fechaEmision ?? peruToday();

    // fechaReferencia must be <= fechaEmision
    const ref = new Date(dto.fechaReferencia);
    const emi = new Date(fechaEmision);
    ref.setHours(0, 0, 0, 0);
    emi.setHours(0, 0, 0, 0);

    if (ref > emi) {
      errors.push({
        field: 'fechaReferencia',
        message: 'Reference date (fechaReferencia) cannot be after emission date',
      });
    }

    // Validate voidable document types and motivo
    const voidableTypes = ['01', '03', '07', '08'];
    if (dto.items) {
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i]!;
        if (!voidableTypes.includes(item.tipoDoc)) {
          errors.push({
            field: `items[${i}].tipoDoc`,
            message: `Document type "${item.tipoDoc}" cannot be voided. Valid types: ${voidableTypes.join(', ')}`,
          });
        }
        if (!item.motivo || item.motivo.trim().length === 0) {
          errors.push({
            field: `items[${i}].motivo`,
            message: 'Void reason (motivo) is required',
          });
        }
      }
    }

    this.throwIfErrors(errors);
  }

  /**
   * Validate that the emission date is within the allowed SUNAT window.
   *
   * Uses Peru timezone (America/Lima, UTC-5) for date comparisons to ensure
   * correct validation regardless of the server's local timezone.
   *
   * SUNAT allows sending documents within a type-specific window (calendar days)
   * after the emission date. Documents dated in the future are also rejected.
   *
   * @param tipoDoc - Document type code to determine the per-type window
   */
  private validateEmissionDate(fechaEmision: string, errors: ValidationError[], tipoDoc?: string): void {
    // Calculate calendar-day difference in Peru timezone
    const diffDays = daysBetweenInPeru(fechaEmision);

    // Cannot emit in the future (negative diff means future date)
    if (diffDays < 0) {
      errors.push({
        field: 'fechaEmision',
        message: 'Emission date cannot be in the future',
      });
      return;
    }

    // Check max days window (per document type, fallback to general MAX_DAYS_TO_SEND)
    const maxDays = (tipoDoc ? MAX_DAYS_BY_DOC_TYPE[tipoDoc] : undefined) ?? MAX_DAYS_TO_SEND;

    if (diffDays > maxDays) {
      errors.push({
        field: 'fechaEmision',
        message: `Emission date exceeds the ${maxDays}-day sending window for this document type`,
      });
    }
  }

  /**
   * Validate currency code.
   */
  private validateCurrency(moneda: string, errors: ValidationError[]): void {
    const validCurrencies = Object.values(TIPO_MONEDA);
    if (!validCurrencies.includes(moneda as any)) {
      errors.push({
        field: 'moneda',
        message: `Invalid currency. Valid codes: ${validCurrencies.join(', ')}`,
      });
    }
  }

  /**
   * Validate invoice line items.
   */
  private validateItems(
    items: Array<{ cantidad: number; valorUnitario: number; descripcion: string; tipoAfectacion?: string }>,
    errors: ValidationError[],
  ): void {
    if (!items || items.length === 0) {
      errors.push({
        field: 'items',
        message: 'At least one item is required',
      });
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;

      if (item.cantidad <= 0) {
        errors.push({
          field: `items[${i}].cantidad`,
          message: 'Quantity must be greater than zero',
        });
      }

      if (item.valorUnitario < 0) {
        errors.push({
          field: `items[${i}].valorUnitario`,
          message: 'Unit value cannot be negative',
        });
      }

      if (!item.descripcion || item.descripcion.trim().length === 0) {
        errors.push({
          field: `items[${i}].descripcion`,
          message: 'Item description is required',
        });
      }

      // Validate tipoAfectacion if provided
      if (item.tipoAfectacion) {
        const validAfectaciones = Object.values(TIPO_AFECTACION_IGV);
        if (!validAfectaciones.includes(item.tipoAfectacion as any)) {
          errors.push({
            field: `items[${i}].tipoAfectacion`,
            message: `Invalid IGV affectation type: ${item.tipoAfectacion}`,
          });
        }
      }
    }
  }

  /**
   * Check if a string is a valid date in YYYY-MM-DD format.
   */
  private isValidDateString(dateStr: string): boolean {
    if (!dateStr || typeof dateStr !== 'string') return false;
    // Must match YYYY-MM-DD pattern
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    // Must parse to a valid Date
    const parsed = new Date(dateStr + 'T00:00:00');
    if (isNaN(parsed.getTime())) return false;
    // Verify the date components match (rejects e.g. 2026-02-30)
    const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() + 1 === month
      && parsed.getUTCDate() === day;
  }

  /**
   * Throw BadRequestException if there are validation errors.
   */
  private throwIfErrors(errors: ValidationError[]): void {
    if (errors.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Document validation failed',
        errors,
      });
    }
  }
}
