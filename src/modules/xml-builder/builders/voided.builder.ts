// ═══════════════════════════════════════════════════════════════════
// Voided XML Builder — Comunicación de Baja (RA)
// Generates SUNAT VoidedDocuments XML
// ═══════════════════════════════════════════════════════════════════

import { create } from 'xmlbuilder2';
import { UBL_NAMESPACES } from '../../../common/constants/index.js';
import type { XmlVoidedData } from '../interfaces/xml-builder.interfaces.js';
import { BaseXmlBuilder } from './base.builder.js';

/** Type alias for the xmlbuilder2 builder object */
type XmlNode = ReturnType<typeof create>;

/**
 * Builds the XML for Comunicación de Baja (VoidedDocuments) — RA.
 *
 * A voided document communication requests the annulment of one or more
 * previously sent documents (facturas, boletas, notas). It is sent
 * asynchronously via `sendSummary` and returns a ticket.
 *
 * Key characteristics:
 * - Root element is <VoidedDocuments> with SUNAT-specific namespace
 * - UBLVersionID=2.0, CustomizationID=1.0
 * - Contains cbc:ReferenceDate (date of the original documents)
 * - Lines use sac:VoidedDocumentsLine
 * - Each line specifies the document to void and the reason
 * - File name format: {RUC}-RA-{YYYYMMDD}-{NNNNN}
 */
export class VoidedBuilder extends BaseXmlBuilder {
  /**
   * Build the complete Voided Documents XML from the provided data.
   *
   * @param data - Voided data including company and document lines
   * @returns The serialized XML string
   */
  build(data: XmlVoidedData): string {
    const doc = this.createVoidedDocument();

    // 1. UBLExtensions — empty container for digital signature
    this.addExtensionContainer(doc);

    // 2. Version identifiers
    doc.ele('cbc:UBLVersionID').txt('2.0').up();
    doc.ele('cbc:CustomizationID').txt('1.0').up();

    // 3. Document ID: RA-YYYYMMDD-NNNNN
    const dateStr = data.fechaEmision.replace(/-/g, '');
    const id = `RA-${dateStr}-${data.correlativo.toString().padStart(5, '0')}`;
    doc.ele('cbc:ID').txt(id).up();

    // 4. Reference date (date of the documents being voided)
    doc.ele('cbc:ReferenceDate').txt(data.fechaReferencia).up();

    // 5. Issue date (date the voided communication is generated)
    doc.ele('cbc:IssueDate').txt(data.fechaEmision).up();

    // 6. Signature reference
    this.addSignatureReference(doc, data.company.ruc);

    // 7. Supplier
    this.addCompanySupplier(doc, data.company);

    // 8. Voided lines
    for (let i = 0; i < data.items.length; i++) {
      this.addVoidedLine(doc, data.items[i]!, i + 1);
    }

    return this.serializeXml(doc);
  }

  /**
   * Create a VoidedDocuments XML document with SUNAT-specific namespaces.
   */
  private createVoidedDocument(): XmlNode {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele(UBL_NAMESPACES.VOIDED_DOCUMENTS, 'VoidedDocuments')
      .att('xmlns:cac', UBL_NAMESPACES.CAC)
      .att('xmlns:cbc', UBL_NAMESPACES.CBC)
      .att('xmlns:ds', UBL_NAMESPACES.DS)
      .att('xmlns:ext', UBL_NAMESPACES.EXT)
      .att('xmlns:sac', UBL_NAMESPACES.SAC);

    return doc;
  }

  /**
   * Add a single sac:VoidedDocumentsLine element.
   */
  private addVoidedLine(
    parent: XmlNode,
    item: XmlVoidedData['items'][number],
    lineNumber: number,
  ): void {
    const line = parent.ele('sac:VoidedDocumentsLine');

    // Line ID
    line.ele('cbc:LineID').txt(lineNumber.toString()).up();

    // Document type code
    line.ele('cbc:DocumentTypeCode').txt(item.tipoDoc).up();

    // Document series
    line.ele('sac:DocumentSerialID').txt(item.serie).up();

    // Document number
    line.ele('sac:DocumentNumberID').txt(item.correlativo.toString()).up();

    // Void reason
    line.ele('sac:VoidReasonDescription').txt(item.motivo).up();

    line.up();
  }
}
