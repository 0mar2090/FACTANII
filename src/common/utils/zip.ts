import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { Writable } from 'node:stream';

/**
 * Create a ZIP buffer from an XML string.
 *
 * SUNAT requires the ZIP and its inner XML file to follow the naming convention:
 * `{RUC}-{TIPO}-{SERIE}-{CORRELATIVO}.zip` containing `{RUC}-{TIPO}-{SERIE}-{CORRELATIVO}.xml`
 *
 * @param xmlContent  - The signed XML document as a UTF-8 string
 * @param xmlFileName - The name for the XML entry inside the ZIP (e.g., "20000000001-01-F001-1.xml")
 * @returns A Buffer containing the ZIP file
 *
 * @example
 * ```ts
 * const zipName = '20000000001-01-F001-1.zip';
 * const xmlName = '20000000001-01-F001-1.xml';
 * const zipBuffer = await createZipFromXml(signedXml, xmlName);
 * ```
 */
export async function createZipFromXml(
  xmlContent: string,
  xmlFileName: string,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    const converter = new Writable({
      write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err: Error) => {
      reject(err);
    });

    converter.on('finish', () => {
      resolve(Buffer.concat(chunks));
    });

    converter.on('error', (err: Error) => {
      reject(err);
    });

    archive.pipe(converter);
    archive.append(xmlContent, { name: xmlFileName });
    archive.finalize();
  });
}

/**
 * Extract the first XML file from a ZIP buffer.
 *
 * Used to read the CDR (Constancia de Recepcion) returned by SUNAT.
 * SUNAT returns a ZIP containing an XML file with the response details
 * including the response code, description, and any observation notes.
 *
 * @param zipBuffer - The ZIP buffer (e.g., CDR from SUNAT)
 * @returns The XML content as a UTF-8 string, or `null` if no XML entry is found
 *
 * @example
 * ```ts
 * const cdrXml = extractXmlFromZip(cdrZipBuffer);
 * if (cdrXml) {
 *   // Parse CDR XML to extract response code, message, notes
 * }
 * ```
 */
export function extractXmlFromZip(zipBuffer: Buffer): string | null {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  const xmlEntry = entries.find((entry) =>
    entry.entryName.toLowerCase().endsWith('.xml'),
  );

  if (!xmlEntry) {
    return null;
  }

  return xmlEntry.getData().toString('utf-8');
}

/**
 * Build the standard SUNAT file name (without extension) from document identifiers.
 *
 * @param ruc         - Company RUC (11 digits)
 * @param tipoDoc     - Document type code (e.g., "01" for factura)
 * @param serie       - Series (e.g., "F001")
 * @param correlativo - Sequential number
 * @returns Base name like "20000000001-01-F001-1"
 *
 * @example
 * ```ts
 * const baseName = buildSunatFileName('20000000001', '01', 'F001', 1);
 * // "20000000001-01-F001-1"
 * const zipName = `${baseName}.zip`;
 * const xmlName = `${baseName}.xml`;
 * ```
 */
export function buildSunatFileName(
  ruc: string,
  tipoDoc: string,
  serie: string,
  correlativo: number,
): string {
  return `${ruc}-${tipoDoc}-${serie}-${correlativo}`;
}
