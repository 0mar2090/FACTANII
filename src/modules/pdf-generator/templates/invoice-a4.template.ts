// ═══════════════════════════════════════════════════════════════════
// A4 Invoice Template — Professional layout for SUNAT electronic invoices
// ═══════════════════════════════════════════════════════════════════

import type { TDocumentDefinitions, Content, TableCell, Column, ContentTable } from 'pdfmake/interfaces.js';
import type { PdfInvoiceData } from '../interfaces/pdf-data.interface.js';

// ── Color palette ──────────────────────────────────────────────────
const PRIMARY = '#1a237e';       // Dark blue — headers and borders
const PRIMARY_LIGHT = '#e8eaf6'; // Very light blue — alternating rows
const TEXT_DARK = '#212121';     // Near-black — body text
const TEXT_MUTED = '#616161';    // Medium gray — secondary labels
const BORDER_COLOR = '#1a237e';  // Border blue
const WHITE = '#ffffff';

// ── Formatting helpers ─────────────────────────────────────────────

function fmt(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function fmtCurrency(symbol: string, value: number, decimals = 2): string {
  return `${symbol} ${fmt(value, decimals)}`;
}

/**
 * Maps tipo de documento de identidad code to human-readable label.
 */
function tipoDocIdentidadLabel(code: string): string {
  const labels: Record<string, string> = {
    '0': 'DOC. NO DOMICILIADO',
    '1': 'DNI',
    '4': 'CARNET DE EXTRANJERIA',
    '6': 'RUC',
    '7': 'PASAPORTE',
    '-': 'OTROS',
  };
  return labels[code] ?? 'OTRO';
}

// ── Template builder ───────────────────────────────────────────────

/**
 * Builds a pdfmake TDocumentDefinitions for an A4-format invoice.
 *
 * Layout structure:
 * 1. Header: company info (left) + document box (right)
 * 2. Client info section
 * 3. Items table with alternating row colors
 * 4. Totals section (right-aligned)
 * 5. Footer: monto en letras, hash, QR placeholder, SUNAT response
 *
 * @param data - Pre-processed invoice data (all amounts as plain numbers)
 * @returns A complete pdfmake document definition
 */
export function buildA4Template(data: PdfInvoiceData): TDocumentDefinitions {
  const {
    companyRuc,
    companyRazonSocial,
    companyDireccion,
    tipoDocNombre,
    serie,
    correlativo,
    fechaEmision,
    fechaVencimiento,
    moneda,
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

  // ── 1. Header section ────────────────────────────────────────────

  const headerSection: Content = {
    columns: [
      // Left: company info
      {
        width: '*',
        stack: [
          {
            text: companyRazonSocial,
            style: 'companyName',
          },
          {
            text: companyDireccion,
            style: 'companyDetail',
            margin: [0, 4, 0, 0],
          },
        ],
      },
      // Right: document type box
      {
        width: 210,
        table: {
          widths: ['*'],
          body: [
            [
              {
                text: `RUC: ${companyRuc}`,
                style: 'docBoxRuc',
                alignment: 'center' as const,
                margin: [0, 8, 0, 2],
              },
            ],
            [
              {
                text: tipoDocNombre,
                style: 'docBoxType',
                alignment: 'center' as const,
                margin: [0, 2, 0, 2],
              },
            ],
            [
              {
                text: documentNumber,
                style: 'docBoxNumber',
                alignment: 'center' as const,
                margin: [0, 2, 0, 8],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1.5,
          vLineWidth: () => 1.5,
          hLineColor: () => BORDER_COLOR,
          vLineColor: () => BORDER_COLOR,
        },
      },
    ],
    columnGap: 20,
    margin: [0, 0, 0, 15],
  };

  // ── 2. Client info section ───────────────────────────────────────

  const clientInfoRows: TableCell[][] = [
    [
      { text: 'Fecha de Emisión:', style: 'labelBold' },
      { text: fechaEmision, style: 'valueText' },
      { text: 'Moneda:', style: 'labelBold' },
      { text: moneda, style: 'valueText' },
    ],
    [
      { text: `${tipoDocIdentidadLabel(clienteTipoDoc)}:`, style: 'labelBold' },
      { text: clienteNumDoc, style: 'valueText' },
      { text: 'Forma de Pago:', style: 'labelBold' },
      { text: formaPago, style: 'valueText' },
    ],
    [
      { text: 'Señor(es):', style: 'labelBold' },
      { text: clienteNombre, style: 'valueText', colSpan: 3 },
      {},
      {},
    ],
  ];

  // Add client address row if present
  if (clienteDireccion) {
    clientInfoRows.push([
      { text: 'Dirección:', style: 'labelBold' },
      { text: clienteDireccion, style: 'valueText', colSpan: 3 },
      {},
      {},
    ]);
  }

  // Add vencimiento if present
  if (fechaVencimiento) {
    clientInfoRows.push([
      { text: 'Fecha de Vencimiento:', style: 'labelBold' },
      { text: fechaVencimiento, style: 'valueText', colSpan: 3 },
      {},
      {},
    ]);
  }

  // Add note reference document if it's a NC/ND
  if (isNoteDocument && docRefSerie && docRefCorrelativo !== undefined) {
    clientInfoRows.push([
      { text: 'Documento de Referencia:', style: 'labelBold' },
      {
        text: `${docRefSerie}-${String(docRefCorrelativo).padStart(8, '0')}`,
        style: 'valueText',
        colSpan: 3,
      },
      {},
      {},
    ]);
  }

  if (isNoteDocument && motivoDescripcion) {
    clientInfoRows.push([
      { text: 'Motivo:', style: 'labelBold' },
      { text: motivoDescripcion, style: 'valueText', colSpan: 3 },
      {},
      {},
    ]);
  }

  const clientSection: Content = {
    table: {
      widths: [100, '*', 90, '*'],
      body: clientInfoRows,
    },
    layout: {
      hLineWidth: (i: number, node: ContentTable) =>
        i === 0 || i === node.table.body.length ? 0.75 : 0,
      vLineWidth: (i: number, node: ContentTable) =>
        i === 0 || i === (node.table.widths as unknown[]).length ? 0.75 : 0,
      hLineColor: () => BORDER_COLOR,
      vLineColor: () => BORDER_COLOR,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
    margin: [0, 0, 0, 15],
  };

  // ── 3. Items table ───────────────────────────────────────────────

  const tableHeader: TableCell[] = [
    { text: '#', style: 'tableHeader', alignment: 'center' as const },
    { text: 'Cantidad', style: 'tableHeader', alignment: 'center' as const },
    { text: 'U.M.', style: 'tableHeader', alignment: 'center' as const },
    { text: 'Descripción', style: 'tableHeader', alignment: 'left' as const },
    { text: 'V. Unitario', style: 'tableHeader', alignment: 'right' as const },
    { text: 'IGV', style: 'tableHeader', alignment: 'right' as const },
    { text: 'Importe', style: 'tableHeader', alignment: 'right' as const },
  ];

  const tableBody: TableCell[][] = items.map((item, idx) => {
    const fillColor = idx % 2 === 0 ? WHITE : PRIMARY_LIGHT;
    return [
      { text: String(item.numero), alignment: 'center' as const, fillColor },
      { text: fmt(item.cantidad, 3), alignment: 'center' as const, fillColor },
      { text: item.unidadMedida, alignment: 'center' as const, fillColor },
      { text: item.descripcion, alignment: 'left' as const, fillColor },
      { text: fmt(item.valorUnitario, 4), alignment: 'right' as const, fillColor },
      { text: fmt(item.igv), alignment: 'right' as const, fillColor },
      { text: fmt(item.valorVenta), alignment: 'right' as const, fillColor },
    ];
  });

  const itemsSection: Content = {
    table: {
      headerRows: 1,
      widths: [22, 50, 30, '*', 65, 50, 65],
      body: [tableHeader, ...tableBody],
    },
    layout: {
      hLineWidth: (i: number) => (i <= 1 ? 1 : 0.5),
      vLineWidth: () => 0.5,
      hLineColor: (i: number) => (i <= 1 ? BORDER_COLOR : '#e0e0e0'),
      vLineColor: () => '#e0e0e0',
      fillColor: (rowIndex: number) => (rowIndex === 0 ? PRIMARY : null),
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 0, 0, 10],
  };

  // ── 4. Totals section ────────────────────────────────────────────

  const totalsRows: TableCell[][] = [];

  if (opGravadas > 0) {
    totalsRows.push([
      { text: 'Op. Gravadas:', style: 'totalsLabel' },
      { text: fmtCurrency(monedaSimbolo, opGravadas), style: 'totalsValue' },
    ]);
  }
  if (opExoneradas > 0) {
    totalsRows.push([
      { text: 'Op. Exoneradas:', style: 'totalsLabel' },
      { text: fmtCurrency(monedaSimbolo, opExoneradas), style: 'totalsValue' },
    ]);
  }
  if (opInafectas > 0) {
    totalsRows.push([
      { text: 'Op. Inafectas:', style: 'totalsLabel' },
      { text: fmtCurrency(monedaSimbolo, opInafectas), style: 'totalsValue' },
    ]);
  }
  if (igv > 0) {
    totalsRows.push([
      { text: 'IGV 18%:', style: 'totalsLabel' },
      { text: fmtCurrency(monedaSimbolo, igv), style: 'totalsValue' },
    ]);
  }
  if (isc > 0) {
    totalsRows.push([
      { text: 'ISC:', style: 'totalsLabel' },
      { text: fmtCurrency(monedaSimbolo, isc), style: 'totalsValue' },
    ]);
  }
  if (icbper > 0) {
    totalsRows.push([
      { text: 'ICBPER:', style: 'totalsLabel' },
      { text: fmtCurrency(monedaSimbolo, icbper), style: 'totalsValue' },
    ]);
  }

  totalsRows.push([
    { text: 'IMPORTE TOTAL:', style: 'totalsFinal' },
    { text: fmtCurrency(monedaSimbolo, totalVenta), style: 'totalsFinalValue' },
  ]);

  const totalsSection: Content = {
    columns: [
      { width: '*', text: '' },
      {
        width: 250,
        table: {
          widths: ['*', 100],
          body: totalsRows,
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: TableCell[][] } }) =>
            i === node.table.body.length - 1 || i === node.table.body.length ? 1 : 0,
          vLineWidth: () => 0,
          hLineColor: () => BORDER_COLOR,
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 4,
          paddingRight: () => 4,
        },
      },
    ],
    margin: [0, 0, 0, 15],
  };

  // ── 5. Footer area: monto en letras + hash + QR + SUNAT ──────────

  const footerContent: Content[] = [];

  // Monto en letras
  footerContent.push({
    text: [
      { text: 'SON: ', bold: true },
      { text: montoEnLetras },
    ],
    style: 'montoLetras',
    margin: [0, 0, 0, 10],
  });

  // Hash and SUNAT response
  const bottomInfoColumns: Column[] = [];

  // Left: QR placeholder + hash
  const leftInfo: Content[] = [];

  // QR code image (SUNAT CPE)
  if (data.qrDataUri) {
    leftInfo.push({
      image: data.qrDataUri,
      width: 90,
      height: 90,
      margin: [0, 0, 0, 6],
    } as any);
  }

  if (xmlHash) {
    leftInfo.push({
      text: [
        { text: 'Valor resumen: ', bold: true, fontSize: 7 },
        { text: xmlHash, fontSize: 6, color: TEXT_MUTED },
      ],
      margin: [0, 0, 0, 4],
    });
  }

  bottomInfoColumns.push({
    width: 'auto',
    stack: leftInfo,
  });

  // Right: SUNAT response and additional info
  const rightInfo: Content[] = [];

  if (sunatCode !== undefined && sunatMessage) {
    const isAccepted = sunatCode === '0';
    rightInfo.push({
      text: [
        { text: 'Respuesta SUNAT: ', bold: true, fontSize: 8 },
        {
          text: isAccepted ? 'ACEPTADA' : `Código ${sunatCode}`,
          fontSize: 8,
          color: isAccepted ? '#2e7d32' : '#c62828',
          bold: true,
        },
      ],
      margin: [0, 0, 0, 2],
    });
    rightInfo.push({
      text: sunatMessage,
      fontSize: 7,
      color: TEXT_MUTED,
      margin: [0, 0, 0, 4],
    });
  }

  rightInfo.push({
    text: 'Representación impresa de la ' + tipoDocNombre,
    fontSize: 7,
    color: TEXT_MUTED,
    italics: true,
    margin: [0, 4, 0, 0],
  });

  rightInfo.push({
    text: 'Autorizado mediante Resolución de Superintendencia',
    fontSize: 7,
    color: TEXT_MUTED,
    italics: true,
  });

  bottomInfoColumns.push({
    width: '*',
    stack: rightInfo,
    margin: [20, 0, 0, 0],
  });

  footerContent.push({
    columns: bottomInfoColumns,
  });

  // ── Assemble complete document ───────────────────────────────────

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],

    info: {
      title: `${tipoDocNombre} ${documentNumber}`,
      author: companyRazonSocial,
      subject: `Comprobante de Pago Electrónico - ${documentNumber}`,
      creator: 'FacturaPE',
    },

    content: [
      headerSection,
      clientSection,
      itemsSection,
      totalsSection,
      ...footerContent,
    ],

    styles: {
      companyName: {
        fontSize: 14,
        bold: true,
        color: PRIMARY,
      },
      companyDetail: {
        fontSize: 9,
        color: TEXT_MUTED,
      },
      docBoxRuc: {
        fontSize: 12,
        bold: true,
        color: PRIMARY,
      },
      docBoxType: {
        fontSize: 11,
        bold: true,
        color: PRIMARY,
      },
      docBoxNumber: {
        fontSize: 12,
        bold: true,
        color: PRIMARY,
      },
      labelBold: {
        fontSize: 9,
        bold: true,
        color: TEXT_DARK,
      },
      valueText: {
        fontSize: 9,
        color: TEXT_DARK,
      },
      tableHeader: {
        fontSize: 8,
        bold: true,
        color: WHITE,
      },
      totalsLabel: {
        fontSize: 9,
        color: TEXT_DARK,
        alignment: 'right' as const,
      },
      totalsValue: {
        fontSize: 9,
        color: TEXT_DARK,
        alignment: 'right' as const,
      },
      totalsFinal: {
        fontSize: 10,
        bold: true,
        color: PRIMARY,
        alignment: 'right' as const,
      },
      totalsFinalValue: {
        fontSize: 10,
        bold: true,
        color: PRIMARY,
        alignment: 'right' as const,
      },
      montoLetras: {
        fontSize: 9,
        color: TEXT_DARK,
      },
    },

    defaultStyle: {
      font: 'Roboto',
      fontSize: 9,
      color: TEXT_DARK,
    },
  };

  return docDefinition;
}
