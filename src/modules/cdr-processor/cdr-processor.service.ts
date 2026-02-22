import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import AdmZip from 'adm-zip';
import type { CdrResult } from './interfaces/cdr-result.interface.js';

@Injectable()
export class CdrProcessorService {
  private readonly logger = new Logger(CdrProcessorService.name);
  private readonly parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true, // Remove namespace prefixes for easier access
      isArray: (_name: string) => {
        // Ensure 'Note' is always an array
        return _name === 'Note';
      },
    });
  }

  /**
   * Process a CDR ZIP buffer from SUNAT response.
   *
   * 1. Extracts the XML from the ZIP
   * 2. Parses the XML with fast-xml-parser
   * 3. Extracts ResponseCode, Description, and Notes
   *
   * CDR XML structure (ApplicationResponse UBL 2.1):
   * ```xml
   * <ApplicationResponse>
   *   <DocumentResponse>
   *     <Response>
   *       <ResponseCode>0</ResponseCode>
   *       <Description>La Factura...</Description>
   *     </Response>
   *   </DocumentResponse>
   *   <Note>observation text</Note>
   * </ApplicationResponse>
   * ```
   */
  processCdr(cdrZipBuffer: Buffer): CdrResult {
    const rawXml = this.extractXmlFromZip(cdrZipBuffer);
    return this.parseXml(rawXml);
  }

  /**
   * Process a CDR from a base64 string (direct SUNAT SOAP response).
   */
  processCdrFromBase64(base64Cdr: string): CdrResult {
    const buffer = Buffer.from(base64Cdr, 'base64');
    return this.processCdr(buffer);
  }

  /**
   * Extract the XML file content from a CDR ZIP buffer.
   * SUNAT CDR ZIPs contain a single XML file named R-{RUC}-{TIPO}-{SERIE}-{CORRELATIVO}.xml
   */
  private extractXmlFromZip(zipBuffer: Buffer): string {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    const xmlEntry = entries.find((e) => e.entryName.endsWith('.xml'));

    if (!xmlEntry) {
      throw new Error(
        'No XML found in CDR ZIP. ' +
          `Entries found: [${entries.map((e) => e.entryName).join(', ')}]`,
      );
    }

    const rawXml = xmlEntry.getData().toString('utf-8');

    if (!rawXml || rawXml.trim().length === 0) {
      throw new Error(
        `CDR XML entry "${xmlEntry.entryName}" is empty`,
      );
    }

    return rawXml;
  }

  /**
   * Parse the CDR XML and extract response code, description, and notes.
   */
  private parseXml(rawXml: string): CdrResult {
    let parsed: Record<string, any>;

    try {
      parsed = this.parser.parse(rawXml);
    } catch (error: any) {
      throw new Error(`Failed to parse CDR XML: ${error.message}`);
    }

    // Navigate the CDR structure — namespace prefixes already removed
    const appResponse = parsed.ApplicationResponse;

    if (!appResponse) {
      throw new Error(
        'Invalid CDR XML: missing ApplicationResponse root element',
      );
    }

    const documentResponse = appResponse.DocumentResponse;
    const response = documentResponse?.Response;

    const responseCode = String(response?.ResponseCode ?? '');
    const description = String(response?.Description ?? '');

    // Notes can be at ApplicationResponse level or inside DocumentResponse
    // depending on SUNAT CDR version. Check both locations.
    const notes = this.extractNotes(appResponse, documentResponse);

    const isAccepted = responseCode === '0';
    const hasObservations = isAccepted && notes.length > 0;

    this.logger.log(
      `CDR processed: code=${responseCode}, accepted=${isAccepted}, observations=${notes.length}`,
    );

    if (!isAccepted) {
      this.logger.warn(
        `CDR rejected: code=${responseCode}, description=${description}`,
      );
    }

    return {
      responseCode,
      description,
      notes,
      isAccepted,
      hasObservations,
      rawXml,
    };
  }

  /**
   * Extract observation notes from CDR XML.
   * Notes may appear at different levels depending on SUNAT CDR version.
   */
  private extractNotes(
    appResponse: Record<string, any>,
    documentResponse?: Record<string, any>,
  ): string[] {
    const notes: string[] = [];

    // Check ApplicationResponse.Note
    const appNotes = appResponse.Note;
    if (appNotes) {
      notes.push(...this.normalizeNotes(appNotes));
    }

    // Check DocumentResponse.Note (some CDR versions)
    if (documentResponse?.Note) {
      notes.push(...this.normalizeNotes(documentResponse.Note));
    }

    return notes;
  }

  /**
   * Normalize note values into a string array.
   * Notes can be strings, objects with #text, or arrays of either.
   */
  private normalizeNotes(rawNotes: unknown): string[] {
    if (!rawNotes) {
      return [];
    }

    const noteArray = Array.isArray(rawNotes) ? rawNotes : [rawNotes];

    return noteArray
      .map((n: any) => {
        if (typeof n === 'string') {
          return n;
        }
        if (typeof n === 'object' && n !== null) {
          // fast-xml-parser may store text content as #text when attributes exist
          return String(n['#text'] ?? JSON.stringify(n));
        }
        return String(n);
      })
      .filter((n) => n.length > 0);
  }
}
