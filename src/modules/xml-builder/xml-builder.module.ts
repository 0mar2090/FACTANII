// ═══════════════════════════════════════════════════════════════════
// XML Builder Module — UBL 2.1 XML generation for SUNAT CPE
// ═══════════════════════════════════════════════════════════════════

import { Module } from '@nestjs/common';
import { XmlBuilderService } from './xml-builder.service.js';
import { XmlValidatorService } from './validators/xml-validator.js';

/**
 * Module providing XML generation and validation capabilities for SUNAT electronic documents.
 *
 * Supports:
 * - Factura (01) and Boleta (03) via buildInvoice()
 * - Nota de Credito (07) via buildCreditNote()
 * - Nota de Debito (08) via buildDebitNote()
 * - Resumen Diario (RC) via buildSummary()
 * - Comunicacion de Baja (RA) via buildVoided()
 * - Pre-send validation via XmlValidatorService
 *
 * The generated XML follows UBL 2.1 as required by SUNAT Peru's
 * SEE-Del Contribuyente system. The XML is unsigned; use the
 * XmlSignerModule to add the digital signature before sending.
 */
@Module({
  providers: [XmlBuilderService, XmlValidatorService],
  exports: [XmlBuilderService, XmlValidatorService],
})
export class XmlBuilderModule {}
