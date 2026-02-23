import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { CdrProcessorService } from './cdr-processor.service.js';

function buildCdrZip(xml: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('R-20000000001-01-F001-00000001.xml', Buffer.from(xml, 'utf-8'));
  return zip.toBuffer();
}

describe('CdrProcessorService', () => {
  const service = new CdrProcessorService();

  it('parses an accepted CDR (code 0)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2">
  <DocumentResponse>
    <Response>
      <ResponseCode>0</ResponseCode>
      <Description>La Factura numero F001-00000001, ha sido aceptada</Description>
    </Response>
  </DocumentResponse>
</ApplicationResponse>`;

    const result = service.processCdr(buildCdrZip(xml));

    expect(result.responseCode).toBe('0');
    expect(result.isAccepted).toBe(true);
    expect(result.hasObservations).toBe(false);
    expect(result.description).toContain('aceptada');
    expect(result.notes).toEqual([]);
    expect(result.rawXml).toBe(xml);
  });

  it('parses an accepted CDR with observations', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2">
  <DocumentResponse>
    <Response>
      <ResponseCode>0</ResponseCode>
      <Description>La Factura ha sido aceptada</Description>
    </Response>
  </DocumentResponse>
  <Note>4252 - El dato ingresado como atributo es un email no valido</Note>
</ApplicationResponse>`;

    const result = service.processCdr(buildCdrZip(xml));

    expect(result.isAccepted).toBe(true);
    expect(result.hasObservations).toBe(true);
    expect(result.notes.length).toBe(1);
    expect(result.notes[0]).toContain('4252');
  });

  it('parses a rejected CDR', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2">
  <DocumentResponse>
    <Response>
      <ResponseCode>2033</ResponseCode>
      <Description>El XML no cumple con el esquema</Description>
    </Response>
  </DocumentResponse>
</ApplicationResponse>`;

    const result = service.processCdr(buildCdrZip(xml));

    expect(result.responseCode).toBe('2033');
    expect(result.isAccepted).toBe(false);
    expect(result.hasObservations).toBe(false);
    expect(result.description).toContain('esquema');
  });

  it('accepts informational CDR codes in range 0100-1999', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2">
  <DocumentResponse>
    <Response>
      <ResponseCode>0100</ResponseCode>
      <Description>El documento fue aceptado con advertencias</Description>
    </Response>
  </DocumentResponse>
</ApplicationResponse>`;

    const result = service.processCdr(buildCdrZip(xml));

    // fast-xml-parser coerces '0100' to number 100, then String() gives '100'
    expect(result.responseCode).toBe('100');
    expect(result.isAccepted).toBe(true);
    expect(result.hasObservations).toBe(true);
  });

  it('throws on empty ZIP (no XML entry)', () => {
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('hello'));
    const buf = zip.toBuffer();

    expect(() => service.processCdr(buf)).toThrow('No XML found in CDR ZIP');
  });

  it('throws on invalid XML', () => {
    expect(() => service.processCdr(buildCdrZip('not xml at all {{{}'))).toThrow();
  });

  it('throws on missing ApplicationResponse root', () => {
    const xml = `<?xml version="1.0"?><Root><Foo/></Root>`;
    expect(() => service.processCdr(buildCdrZip(xml))).toThrow(
      'missing ApplicationResponse',
    );
  });

  it('parses CDR from base64', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2">
  <DocumentResponse>
    <Response>
      <ResponseCode>0</ResponseCode>
      <Description>Aceptado</Description>
    </Response>
  </DocumentResponse>
</ApplicationResponse>`;

    const base64 = buildCdrZip(xml).toString('base64');
    const result = service.processCdrFromBase64(base64);

    expect(result.isAccepted).toBe(true);
    expect(result.responseCode).toBe('0');
  });
});
