import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { XmlSignerService } from './xml-signer.service.js';

/**
 * Tests for XmlSignerService.
 *
 * These tests require the test PFX certificate at test/manual/test-cert.pfx.
 * If not present, tests are skipped.
 */
describe('XmlSignerService', () => {
  const service = new XmlSignerService();
  const pfxPath = join(process.cwd(), 'test', 'manual', 'test-cert.pfx');
  const passphrase = '12345678';
  let pfxBuffer: Buffer;
  let hasCert = false;

  beforeAll(() => {
    if (existsSync(pfxPath)) {
      pfxBuffer = readFileSync(pfxPath);
      hasCert = true;
    }
  });

  // Sample unsigned UBL XML with ExtensionContent placeholder
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>F001-00000001</cbc:ID>
</Invoice>`;

  it('signs XML and produces ds:Signature element', () => {
    if (!hasCert) {
      console.log('Skipping: test-cert.pfx not found');
      return;
    }

    const signedXml = service.sign(sampleXml, pfxBuffer, passphrase);

    expect(signedXml).toContain('<ds:Signature');
    expect(signedXml).toContain('Id="SignatureSP"');
    expect(signedXml).toContain('<ds:X509Certificate>');
    expect(signedXml).toContain('rsa-sha256');
  });

  it('produces different output from input (signature was added)', () => {
    if (!hasCert) {
      console.log('Skipping: test-cert.pfx not found');
      return;
    }

    const signedXml = service.sign(sampleXml, pfxBuffer, passphrase);

    expect(signedXml).not.toBe(sampleXml);
    expect(signedXml.length).toBeGreaterThan(sampleXml.length);
  });

  it('getXmlHash returns a 64-char hex string (SHA-256)', () => {
    const hash = service.getXmlHash('<root>test</root>');

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('getXmlHash returns different hashes for different inputs', () => {
    const hash1 = service.getXmlHash('<root>test1</root>');
    const hash2 = service.getXmlHash('<root>test2</root>');

    expect(hash1).not.toBe(hash2);
  });

  it('getXmlHash is deterministic', () => {
    const input = '<root>deterministic</root>';
    const hash1 = service.getXmlHash(input);
    const hash2 = service.getXmlHash(input);

    expect(hash1).toBe(hash2);
  });
});
