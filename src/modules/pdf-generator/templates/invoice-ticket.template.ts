// ═══════════════════════════════════════════════════════════════════
// Ticket Invoice Template — 80mm thermal printer layout for SUNAT CPE
// ═══════════════════════════════════════════════════════════════════

import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces.js';
import type { PdfInvoiceData } from '../interfaces/pdf-data.interface.js';

// ── Layout constants ───────────────────────────────────────────────
// 80mm = ~226.77 points at 72dpi; margins eat ~20pt on each side
const PAGE_WIDTH = 226.77;
const CONTENT_WIDTH = PAGE_WIDTH - 20; // ~206pt usable

const TEXT_DARK = '#212121';
const TEXT_MUTED = '#616161';
const SEPARATOR_COLOR = '#9e9e9e';

// ── Formatting helpers ─────────────────────────────────────────────

function fmt(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function fmtCurrency(symbol: string, value: number): string {
  return `${symbol} ${fmt(value)}`;
}

/**
 * Creates a dashed separator line for the ticket layout.
 */
function separator(): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: '', border: [false, false, false, true] }]],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => SEPARATOR_COLOR,
      hLineStyle: () => ({ dash: { length: 2, space: 2 } }),
    },
    margin: [0, 3, 0, 3],
  };
}

// ── Template builder ───────────────────────────────────────────────

/**
 * Builds a pdfmake TDocumentDefinitions for an 80mm ticket-format invoice.
 *
 * Designed for thermal printers (80mm paper width). Uses compact fonts,
 * center-aligned headers, and minimal margins. Page height is set to auto
 * to accommodate variable item counts.
 *
 * Layout:
 * 1. Company name + RUC (centered)
 * 2. Document type + number (centered, bold)
 * 3. Separator
 * 4. Client info (compact)
 * 5. Items (description + amount per line)
 * 6. Separator
 * 7. Totals
 * 8. Monto en letras
 * 9. Hash + SUNAT response
 *
 * @param data - Pre-processed invoice data
 * @returns A complete pdfmake document definition for ticket printing
 */
export function buildTicketTemplate(data: PdfInvoiceData): TDocumentDefinitions {
  const {
    companyRuc,
    companyRazonSocial,
    companyDireccion,
    tipoDocNombre,
    serie,
    correlativo,
    fechaEmision,
    fechaVencimiento,
    monedaSimbolo,
    clienteTipoDoc,
    clienteNumDoc,
    clienteNombre,
    clienteDireccion,
    items,
    opGravadas,
    opExoneradas,
    opInafectas,
    igv,
    isc,
    icbper,
    opGratuitas,
    opExportacion,
    opIvap,
    igvIvap,
    igvRate,
    codigoDetraccion,
    porcentajeDetraccion,
    montoDetraccion,
    totalVenta,
    montoEnLetras,
    xmlHash,
    sunatCode,
    sunatMessage,
    formaPago,
    tipoDoc,
    motivoDescripcion,
    docRefSerie,
    docRefCorrelativo,
  } = data;

  const documentNumber = `${serie}-${String(correlativo).padStart(8, '0')}`;
  const isNoteDocument = tipoDoc === '07' || tipoDoc === '08';

  const content: Content[] = [];

  // ── 1. Company header (centered) ─────────────────────────────────

  content.push({
    text: companyRazonSocial,
    fontSize: 10,
    bold: true,
    alignment: 'center',
    margin: [0, 0, 0, 2],
  });

  content.push({
    text: `RUC: ${companyRuc}`,
    fontSize: 8,
    alignment: 'center',
    margin: [0, 0, 0, 1],
  });

  content.push({
    text: companyDireccion,
    fontSize: 7,
    alignment: 'center',
    color: TEXT_MUTED,
    margin: [0, 0, 0, 4],
  });

  content.push(separator());

  // ── 2. Document type + number (centered) ─────────────────────────

  content.push({
    text: tipoDocNombre,
    fontSize: 9,
    bold: true,
    alignment: 'center',
    margin: [0, 2, 0, 1],
  });

  content.push({
    text: documentNumber,
    fontSize: 10,
    bold: true,
    alignment: 'center',
    margin: [0, 0, 0, 4],
  });

  content.push(separator());

  // ── 3. Client info ───────────────────────────────────────────────

  const clientTipoLabel =
    clienteTipoDoc === '6' ? 'RUC' :
    clienteTipoDoc === '1' ? 'DNI' :
    'DOC';

  const clientRows: Content[] = [
    {
      text: [
        { text: 'Fecha: ', bold: true, fontSize: 8 },
        { text: fechaEmision, fontSize: 8 },
      ],
      margin: [0, 1, 0, 1],
    },
    {
      text: [
        { text: `${clientTipoLabel}: `, bold: true, fontSize: 8 },
        { text: clienteNumDoc, fontSize: 8 },
      ],
      margin: [0, 1, 0, 1],
    },
    {
      text: [
        { text: 'Cliente: ', bold: true, fontSize: 8 },
        { text: clienteNombre, fontSize: 8 },
      ],
      margin: [0, 1, 0, 1],
    },
  ];

  if (clienteDireccion) {
    clientRows.push({
      text: [
        { text: 'Dir.: ', bold: true, fontSize: 8 },
        { text: clienteDireccion, fontSize: 7 },
      ],
      margin: [0, 1, 0, 1],
    });
  }

  if (fechaVencimiento) {
    clientRows.push({
      text: [
        { text: 'Vencimiento: ', bold: true, fontSize: 8 },
        { text: fechaVencimiento, fontSize: 8 },
      ],
      margin: [0, 1, 0, 1],
    });
  }

  clientRows.push({
    text: [
      { text: 'F. Pago: ', bold: true, fontSize: 8 },
      { text: formaPago, fontSize: 8 },
    ],
    margin: [0, 1, 0, 1],
  });

  // Note reference
  if (isNoteDocument && docRefSerie && docRefCorrelativo !== undefined) {
    clientRows.push({
      text: [
        { text: 'Doc. Ref.: ', bold: true, fontSize: 8 },
        { text: `${docRefSerie}-${String(docRefCorrelativo).padStart(8, '0')}`, fontSize: 8 },
      ],
      margin: [0, 1, 0, 1],
    });
  }

  if (isNoteDocument && motivoDescripcion) {
    clientRows.push({
      text: [
        { text: 'Motivo: ', bold: true, fontSize: 8 },
        { text: motivoDescripcion, fontSize: 7 },
      ],
      margin: [0, 1, 0, 1],
    });
  }

  content.push({ stack: clientRows, margin: [0, 2, 0, 2] });
  content.push(separator());

  // ── 4. Items table ───────────────────────────────────────────────

  // Compact table header
  const itemTableHeader: TableCell[] = [
    { text: 'Cant.', bold: true, fontSize: 7, alignment: 'center' as const },
    { text: 'Descripción', bold: true, fontSize: 7, alignment: 'left' as const },
    { text: 'P.U.', bold: true, fontSize: 7, alignment: 'right' as const },
    { text: 'Importe', bold: true, fontSize: 7, alignment: 'right' as const },
  ];

  const itemTableBody: TableCell[][] = items.map((item) => [
    { text: fmt(item.cantidad, 2), fontSize: 7, alignment: 'center' as const },
    { text: item.descripcion, fontSize: 7, alignment: 'left' as const },
    { text: fmt(item.valorUnitario, 2), fontSize: 7, alignment: 'right' as const },
    { text: fmt(item.valorVenta, 2), fontSize: 7, alignment: 'right' as const },
  ]);

  content.push({
    table: {
      headerRows: 1,
      widths: [28, '*', 38, 45],
      body: [itemTableHeader, ...itemTableBody],
    },
    layout: {
      hLineWidth: (i: number) => (i <= 1 ? 0.5 : 0),
      vLineWidth: () => 0,
      hLineColor: () => SEPARATOR_COLOR,
      paddingTop: () => 2,
      paddingBottom: () => 2,
      paddingLeft: () => 2,
      paddingRight: () => 2,
    },
    margin: [0, 2, 0, 2],
  });

  content.push(separator());

  // ── 5. Totals ────────────────────────────────────────────────────

  const totalsRows: TableCell[][] = [];

  if (opGravadas > 0) {
    totalsRows.push([
      { text: 'Op. Gravadas:', fontSize: 8, alignment: 'left' as const },
      { text: fmtCurrency(monedaSimbolo, opGravadas), fontSize: 8, alignment: 'right' as const },
    ]);
  }
  if (opExoneradas > 0) {
    totalsRows.push([
      { text: 'Op. Exoneradas:', fontSize: 8, alignment: 'left' as const },
      { text: fmtCurrency(monedaSimbolo, opExoneradas), fontSize: 8, alignment: 'right' as const },
    ]);
  }
  if (opInafectas > 0) {
    totalsRows.push([
      { text: 'Op. Inafectas:', fontSize: 8, alignment: 'left' as const },
      { text: fmtCurrency(monedaSimbolo, opInafectas), fontSize: 8, alignment: 'right' as const },
    ]);
  }
  if (opGratuitas && opGratuitas > 0) {
    totalsRows.push([
      { text: 'Op. Gratuitas:', fontSize: 8, alignment: 'left' as const },
      { text: fmtCurrency(monedaSimbolo, opGratuitas), fontSize: 8, alignment: 'right' as const },
    ]);
  }
  if (opExportacion && opExportacion > 0) {
    totalsRows.push([
      { text: 'Op. Exportación:', fontSize: 8, alignment: 'left' as const },
      { text: fmtCurrency(monedaSimbolo, opExportacion), fontSize: 8, alignment: 'right' as const },
    ]);
  }
  if (igv > 0) {
    const igvPct = igvRate ? `${(igvRate * 100).toFixed(igvRate * 100 % 1 === 0 ? 0 : 1)}%` : '18%';
    totalsRows.push([
      { text: `IGV ${igvPct}:`, fontSize: 8, alignment: 'left' as const },
      { text: fmtCurrency(monedaSimbolo, igv), fontSize: 8, alignment: 'right' as const },
    ]);
  }
  if (isc > 0) {
    totalsRows.push([
      { text: 'ISC:', fontSize: 8, alignment: 'left' as const },
      { text: fmtCurrency(monedaSimbolo, isc), fontSize: 8, alignment: 'right' as const },
    ]);
  }
  if (icbper > 0) {
    totalsRows.push([
      { text: 'ICBPER:', fontSize: 8, alignment: 'left' as const },
      { text: fmtCurrency(monedaSimbolo, icbper), fontSize: 8, alignment: 'right' as const },
    ]);
  }
  if (opIvap && opIvap > 0) {
    totalsRows.push([
      { text: 'Op. IVAP:', fontSize: 8, alignment: 'left' as const },
      { text: fmtCurrency(monedaSimbolo, opIvap), fontSize: 8, alignment: 'right' as const },
    ]);
  }
  if (igvIvap && igvIvap > 0) {
    totalsRows.push([
      { text: 'IVAP 4%:', fontSize: 8, alignment: 'left' as const },
      { text: fmtCurrency(monedaSimbolo, igvIvap), fontSize: 8, alignment: 'right' as const },
    ]);
  }
  if (montoDetraccion && montoDetraccion > 0) {
    const detPct = porcentajeDetraccion ? `${(porcentajeDetraccion * 100).toFixed(0)}%` : '';
    totalsRows.push([
      { text: `Detracc.${detPct ? ` ${detPct}` : ''}:`, fontSize: 8, alignment: 'left' as const },
      { text: `-${fmtCurrency(monedaSimbolo, montoDetraccion)}`, fontSize: 8, alignment: 'right' as const },
    ]);
  }

  totalsRows.push([
    { text: 'TOTAL:', fontSize: 9, bold: true, alignment: 'left' as const },
    { text: fmtCurrency(monedaSimbolo, totalVenta), fontSize: 9, bold: true, alignment: 'right' as const },
  ]);

  content.push({
    table: {
      widths: ['*', 'auto'],
      body: totalsRows,
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: TableCell[][] } }) =>
        i === node.table.body.length ? 0.5 : 0,
      vLineWidth: () => 0,
      hLineColor: () => SEPARATOR_COLOR,
      paddingTop: () => 1,
      paddingBottom: () => 1,
      paddingLeft: () => 2,
      paddingRight: () => 2,
    },
    margin: [0, 2, 0, 4],
  });

  // ── 6. Monto en letras ───────────────────────────────────────────

  content.push({
    text: [
      { text: 'SON: ', bold: true },
      { text: montoEnLetras },
    ],
    fontSize: 7,
    margin: [0, 0, 0, 4],
  });

  content.push(separator());

  // ── 7. QR code + Hash + SUNAT response ──────────────────────────

  if (data.qrDataUri) {
    content.push({
      image: data.qrDataUri,
      width: 80,
      height: 80,
      alignment: 'center',
      margin: [0, 4, 0, 4],
    } as any);
  }

  if (xmlHash) {
    content.push({
      text: [
        { text: 'Hash: ', bold: true, fontSize: 6 },
        { text: xmlHash, fontSize: 5, color: TEXT_MUTED },
      ],
      margin: [0, 2, 0, 2],
    });
  }

  if (sunatCode !== undefined && sunatMessage) {
    const isAccepted = sunatCode === '0';
    content.push({
      text: [
        { text: 'SUNAT: ', bold: true, fontSize: 7 },
        {
          text: isAccepted ? 'ACEPTADA' : `Código ${sunatCode}`,
          fontSize: 7,
          bold: true,
          color: isAccepted ? '#2e7d32' : '#c62828',
        },
      ],
      margin: [0, 0, 0, 1],
    });
    content.push({
      text: sunatMessage,
      fontSize: 6,
      color: TEXT_MUTED,
      margin: [0, 0, 0, 4],
    });
  }

  // ── 8. Footer ────────────────────────────────────────────────────

  content.push({
    text: 'Representación impresa del CPE',
    fontSize: 6,
    color: TEXT_MUTED,
    alignment: 'center',
    italics: true,
    margin: [0, 4, 0, 2],
  });

  content.push({
    text: 'Generado por FacturaPE',
    fontSize: 5,
    color: TEXT_MUTED,
    alignment: 'center',
    margin: [0, 0, 0, 0],
  });

  // ── Assemble document ────────────────────────────────────────────

  const docDefinition: TDocumentDefinitions = {
    pageSize: {
      width: PAGE_WIDTH,
      height: 'auto' as unknown as number,
    },
    pageMargins: [10, 10, 10, 10],

    info: {
      title: `${tipoDocNombre} ${documentNumber}`,
      author: companyRazonSocial,
      subject: `Ticket - ${documentNumber}`,
      creator: 'FacturaPE',
    },

    content,

    defaultStyle: {
      font: 'Roboto',
      fontSize: 8,
      color: TEXT_DARK,
    },
  };

  return docDefinition;
}
