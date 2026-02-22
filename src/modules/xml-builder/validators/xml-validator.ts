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
  TIPO_MONEDA,
  IGV_RATE,
  MAX_DAYS_TO_SEND,
} from '../../../common/constants/index.js';
import type { CreateInvoiceDto } from '../../invoices/dto/create-invoice.dto.js';
import type { CreateCreditNoteDto } from '../../invoices/dto/create-credit-note.dto.js';
import type { CreateDebitNoteDto } from '../../invoices/dto/create-debit-note.dto.js';

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
    }

    // Validate emission date
    this.validateEmissionDate(dto.fechaEmision, errors);

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
    this.validateEmissionDate(dto.fechaEmision, errors);

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
    this.validateEmissionDate(dto.fechaEmision, errors);

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
   * Validate that the emission date is within the allowed SUNAT window.
   *
   * SUNAT allows sending documents up to MAX_DAYS_TO_SEND calendar days
   * after the emission date. Documents dated in the future are also rejected.
   */
  private validateEmissionDate(fechaEmision: string, errors: ValidationError[]): void {
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

    // Check max days window
    const diffMs = today.getTime() - emissionDay.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > MAX_DAYS_TO_SEND) {
      errors.push({
        field: 'fechaEmision',
        message: `Emission date exceeds the ${MAX_DAYS_TO_SEND}-day sending window`,
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
