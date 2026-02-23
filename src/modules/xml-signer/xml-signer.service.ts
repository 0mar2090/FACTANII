import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SignedXml } from 'xml-crypto';
import { readPfx } from './utils/pfx-reader.js';
import type { GetKeyInfoContentArgs } from 'xml-crypto';

/**
 * Service responsible for signing XML documents with XMLDSig (enveloped signature)
 * using SHA-256, as required by SUNAT Peru for electronic invoicing (UBL 2.1).
 *
 * The signature is placed inside the first empty ext:ExtensionContent element
 * that was left as a placeholder by the XML builder.
 *
 * SUNAT Requirements:
 * - Signature algorithm: RSA-SHA256
 * - Digest algorithm: SHA-256
 * - Canonicalization: Exclusive XML Canonicalization (exc-c14n)
 * - KeyInfo must contain X509Data with the full signing certificate
 * - Signature ID: "SignatureSP" (matches cac:Signature reference in document)
 * - Enveloped signature transform
 */
@Injectable()
export class XmlSignerService {
  private readonly logger = new Logger(XmlSignerService.name);

  /**
   * Sign an XML document with XMLDSig SHA-256 enveloped signature.
   *
   * The signature is inserted into the first empty
   * ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent element,
   * which the XML builder leaves as a placeholder for the digital signature.
   *
   * @param xml - The unsigned XML string (UBL 2.1 document)
   * @param pfxBuffer - The decrypted PFX buffer containing the private key and certificate
   * @param passphrase - The PFX passphrase
   * @returns The signed XML string with the ds:Signature element embedded
   * @throws Error if the PFX is invalid, the passphrase is wrong, or the XML cannot be signed
   */
  sign(xml: string, pfxBuffer: Buffer, passphrase: string): string {
    // Extract private key and certificate from PFX
    const { privateKeyPem, certificatePem } = readPfx(pfxBuffer, passphrase);

    // Create the SignedXml instance with SHA-256 configuration
    const sig = new SignedXml({
      privateKey: privateKeyPem,
      publicCert: certificatePem,
      canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      getKeyInfoContent: this.buildKeyInfoContent(certificatePem),
    });

    // Add reference to the entire document using enveloped signature transform.
    // The empty URI ("") with isEmptyUri=true references the whole document,
    // and the enveloped-signature transform removes the Signature element
    // itself from the digest calculation to avoid circular references.
    sig.addReference({
      xpath: '/*',
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/2001/10/xml-exc-c14n#',
      ],
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      uri: '',
      isEmptyUri: true,
    });

    // Compute the signature and place it inside the first empty ext:ExtensionContent.
    // The XPath selects the ExtensionContent element that has no child elements,
    // which is the placeholder left by the XML builder for the signature.
    sig.computeSignature(xml, {
      prefix: 'ds',
      attrs: {
        Id: 'SignatureSP',
      },
      location: {
        reference: "/*/*[local-name()='UBLExtensions']/*[local-name()='UBLExtension']/*[local-name()='ExtensionContent'][not(*)]",
        action: 'append',
      },
      existingPrefixes: {
        cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
        ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      },
    });

    const signedXml = sig.getSignedXml();

    this.logger.log('XML document signed successfully with SHA-256');

    return signedXml;
  }

  /**
   * Compute the SHA-256 hash of a signed XML document.
   *
   * This hash is stored in the database for integrity verification
   * and is used as the digest value when referencing the document.
   *
   * @param signedXml - The signed XML string
   * @returns The SHA-256 hash as a hex string
   */
  getXmlHash(signedXml: string): string {
    return createHash('sha256').update(signedXml, 'utf8').digest('hex');
  }

  /**
   * Build a custom getKeyInfoContent function that embeds the X.509 certificate
   * in the KeyInfo element as X509Data/X509Certificate.
   *
   * SUNAT requires the signing certificate to be included in the signature's
   * KeyInfo so the CDR processor can validate the signature.
   *
   * @param certificatePem - The X.509 certificate in PEM format
   * @returns A function compatible with xml-crypto's getKeyInfoContent option
   */
  private buildKeyInfoContent(
    certificatePem: string,
  ): (args?: GetKeyInfoContentArgs) => string | null {
    // Strip PEM headers/footers and whitespace to get the raw base64 certificate
    const certBase64 = certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');

    return ({ prefix }: GetKeyInfoContentArgs = {}): string => {
      const p = prefix ? `${prefix}:` : '';
      return (
        `<${p}X509Data>` +
        `<${p}X509Certificate>${certBase64}</${p}X509Certificate>` +
        `</${p}X509Data>`
      );
    };
  }
}
