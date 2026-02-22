import * as forge from 'node-forge';

/**
 * Represents the key pair and certificate extracted from a PFX file.
 */
export interface PfxKeyPair {
  /** Private key in PEM format */
  privateKeyPem: string;
  /** X.509 certificate in PEM format */
  certificatePem: string;
  /** X.509 certificate in DER format (raw bytes for KeyInfo) */
  certificateDer: Buffer;
}

/**
 * Extract private key and X.509 certificate from a PFX (PKCS#12) buffer.
 *
 * This utility parses the PFX binary data using node-forge and returns
 * the private key and certificate in PEM format, plus the certificate
 * in DER format for embedding in XMLDSig KeyInfo/X509Data.
 *
 * @param pfxBuffer - The raw PFX file contents as a Buffer
 * @param passphrase - The passphrase to unlock the PFX
 * @returns The extracted key pair and certificate
 * @throws Error if the PFX cannot be parsed or is missing key/cert
 */
export function readPfx(pfxBuffer: Buffer, passphrase: string): PfxKeyPair {
  // 1. Parse the PFX binary data into an ASN.1 structure
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));

  // 2. Decode the PKCS#12 structure with the provided passphrase
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);

  // 3. Extract private key bags (shroudedKeyBag / keyBag)
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];

  // Fallback to unencrypted key bag if shrouded not found
  if (!keyBag || keyBag.length === 0) {
    const unencKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
    keyBag = unencKeyBags[forge.pki.oids.keyBag];
  }

  if (!keyBag || keyBag.length === 0 || !keyBag[0].key) {
    throw new Error(
      'No private key found in PFX file. Ensure the PFX contains a private key.',
    );
  }

  const privateKey = keyBag[0].key;

  // 4. Extract certificate bags (certBag)
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certs = certBags[forge.pki.oids.certBag];

  if (!certs || certs.length === 0 || !certs[0].cert) {
    throw new Error(
      'No certificate found in PFX file. Ensure the PFX contains an X.509 certificate.',
    );
  }

  const certificate = certs[0].cert;

  // 5. Convert private key to PEM format
  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);

  // 6. Convert certificate to PEM format
  const certificatePem = forge.pki.certificateToPem(certificate);

  // 7. Convert certificate to DER format (for X509Data in KeyInfo)
  //    First convert the certificate to its ASN.1 representation,
  //    then serialize to DER binary string, then to a Node.js Buffer
  const certAsn1 = forge.pki.certificateToAsn1(certificate);
  const certDerBytes = forge.asn1.toDer(certAsn1).getBytes();
  const certificateDer = Buffer.from(certDerBytes, 'binary');

  return {
    privateKeyPem,
    certificatePem,
    certificateDer,
  };
}
