import { describe, it, expect } from 'vitest';
import { createZipFromXml, extractXmlFromZip, buildSunatFileName } from './zip.js';

describe('createZipFromXml / extractXmlFromZip', () => {
  it('round-trips XML content through ZIP', async () => {
    const xml = '<?xml version="1.0"?><Invoice><cbc:ID>F001-1</cbc:ID></Invoice>';
    const fileName = '20000000001-01-F001-1.xml';

    const zipBuffer = await createZipFromXml(xml, fileName);
    expect(Buffer.isBuffer(zipBuffer)).toBe(true);
    expect(zipBuffer.length).toBeGreaterThan(0);

    const extracted = extractXmlFromZip(zipBuffer);
    expect(extracted).toBe(xml);
  });

  it('preserves UTF-8 content with special characters', async () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><Desc>Facturación — ñ áéíóú</Desc>';
    const zipBuffer = await createZipFromXml(xml, 'test.xml');
    const extracted = extractXmlFromZip(zipBuffer);
    expect(extracted).toBe(xml);
  });

  it('creates valid ZIP with correct entry name', async () => {
    const fileName = '20000000001-01-F001-123.xml';
    const zipBuffer = await createZipFromXml('<root/>', fileName);

    // adm-zip can read it and find the entry
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.entryName).toBe(fileName);
  });

  it('handles large XML content', async () => {
    const largeXml = '<root>' + '<item>test data</item>'.repeat(10000) + '</root>';
    const zipBuffer = await createZipFromXml(largeXml, 'large.xml');

    // ZIP should be smaller than raw XML due to compression
    expect(zipBuffer.length).toBeLessThan(Buffer.byteLength(largeXml));

    const extracted = extractXmlFromZip(zipBuffer);
    expect(extracted).toBe(largeXml);
  });
});

describe('extractXmlFromZip', () => {
  it('returns null when ZIP has no XML entries', async () => {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('no xml here'));
    const zipBuffer = zip.toBuffer();

    expect(extractXmlFromZip(zipBuffer)).toBeNull();
  });

  it('finds .xml entry regardless of case', async () => {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip();
    zip.addFile('RESPONSE.XML', Buffer.from('<response/>'));
    const zipBuffer = zip.toBuffer();

    expect(extractXmlFromZip(zipBuffer)).toBe('<response/>');
  });
});

describe('buildSunatFileName', () => {
  it('builds standard SUNAT file name for factura', () => {
    const name = buildSunatFileName('20000000001', '01', 'F001', 1);
    expect(name).toBe('20000000001-01-F001-1');
  });

  it('builds file name for boleta', () => {
    const name = buildSunatFileName('20000000001', '03', 'B001', 42);
    expect(name).toBe('20000000001-03-B001-42');
  });

  it('builds file name for credit note', () => {
    const name = buildSunatFileName('20000000001', '07', 'FC01', 5);
    expect(name).toBe('20000000001-07-FC01-5');
  });

  it('builds file name for debit note', () => {
    const name = buildSunatFileName('20000000001', '08', 'FD01', 100);
    expect(name).toBe('20000000001-08-FD01-100');
  });

  it('can be used to create zip and xml names', () => {
    const base = buildSunatFileName('20000000001', '01', 'F001', 1);
    expect(`${base}.zip`).toBe('20000000001-01-F001-1.zip');
    expect(`${base}.xml`).toBe('20000000001-01-F001-1.xml');
  });
});
