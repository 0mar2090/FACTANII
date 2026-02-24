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
} from '../../../common/constants/index.js';
import { round2 } from '../../../common/utils/tax-calculator.js';
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
      // Only apply IGV to gravado oneroso items ('10' or default);
      // exonerado ('20'+), inafecto ('30'+), exportación ('40'), and
      // gravado gratuito ('11'-'17') don't add to the buyer's total.
      const estimatedTotal = round2(dto.items.reduce((sum, item) => {
        const qty = item.cantidad ?? 0;
        const unit = item.valorUnitario ?? 0;
        const afectacion = item.tipoAfectacion ?? '10';
        const isGravadoOneroso = afectacion === '10';
        const igvMultiplier = isGravadoOneroso ? (1 + IGV_RATE) : 1;
        // Gratuitas (11-17, 21, 31-36) don't contribute to buyer total
        const isGratuita = ['11','12','13','14','15','16','17','21','31','32','33','34','35','36'].includes(afectacion);
        return sum + (isGratuita ? 0 : qty * unit * igvMultiplier);
      }, 0));

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
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i]!;
        if (item.importeTotal <= 0) {
          errors.push({
            field: `items[${i}].importeTotal`,
            message: 'Document amount must be greater than zero',
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
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i]!;
        if (item.importeTotal <= 0) {
          errors.push({
            field: `items[${i}].importeTotal`,
            message: 'Document amount must be greater than zero',
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

    // If private transport, conductor and vehiculo are required
    if (dto.modalidadTransporte === MODALIDAD_TRANSPORTE.TRANSPORTE_PRIVADO) {
      if (!dto.conductor) {
        errors.push({
          field: 'conductor',
          message: 'Driver (conductor) is required for private transport mode',
        });
      } else if (!dto.conductor.licencia) {
        errors.push({
          field: 'conductor.licencia',
          message: 'Driver license (licencia) is required for private transport mode',
        });
      }
      if (!dto.vehiculo) {
        errors.push({
          field: 'vehiculo',
          message: 'Vehicle (vehiculo) is required for private transport mode',
        });
      }
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

    const fechaEmision = dto.fechaEmision ?? new Date().toISOString().split('T')[0]!;

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

    // NC/ND items in a summary require document reference
    if (dto.items) {
      for (let i = 0; i < dto.items.length; i++) {
        const item = dto.items[i]!;
        if ((item.tipoDoc === '07' || item.tipoDoc === '08') && !item.docRefTipo) {
          errors.push({
            field: `items[${i}].docRefTipo`,
            message: 'NC/ND items in a summary require a document reference (docRefTipo)',
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

    const fechaEmision = dto.fechaEmision ?? new Date().toISOString().split('T')[0]!;

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
   * SUNAT allows sending documents within a type-specific window (calendar days)
   * after the emission date. Documents dated in the future are also rejected.
   *
   * @param tipoDoc - Document type code to determine the per-type window
   */
  private validateEmissionDate(fechaEmision: string, errors: ValidationError[], tipoDoc?: string): void {
    const emissionDate = new Date(fechaEmision);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Cannot emit in the future
    const emissionDay = new Date(emissionDate);
    emissionDay.setHours(0, 0, 0, 0);

    if (emissionDay > today) {
      errors.push({
        field: 'fechaEmision',
        message: 'Emission date cannot be in the future',
      });
      return;
    }

    // Check max days window (per document type, fallback to general MAX_DAYS_TO_SEND)
    const maxDays = (tipoDoc ? MAX_DAYS_BY_DOC_TYPE[tipoDoc] : undefined) ?? MAX_DAYS_TO_SEND;
    const diffMs = today.getTime() - emissionDay.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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
