import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import forge from 'node-forge';
import { PrismaService } from '../prisma/prisma.service.js';
import { encrypt, encryptBuffer, decryptBuffer, decrypt } from '../../common/utils/encryption.js';
import type { EncryptedData } from '../../common/utils/encryption.js';

export interface CertificateInfo {
  serialNumber: string;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
}

/** Cached active certificate data per company */
interface CachedCertificate {
  pfxBuffer: Buffer;
  passphrase: string;
  info: CertificateInfo;
  cachedAt: number;
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  /** In-memory cache for decrypted active certificates, keyed by companyId */
  private readonly certCache = new Map<string, CachedCertificate>();
  /** Cache TTL: 10 minutes (certificates rarely change mid-session) */
  private static readonly CERT_CACHE_TTL_MS = 10 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upload and store a PFX certificate (encrypted with AES-256-GCM)
   */
  async upload(companyId: string, pfxBuffer: Buffer, passphrase: string) {
    // Validate PFX and extract info
    const info = this.extractCertificateInfo(pfxBuffer, passphrase);

    // Check if certificate is valid
    if (info.validTo < new Date()) {
      throw new BadRequestException('Certificate has expired');
    }

    // Encrypt PFX data
    const encPfx = encryptBuffer(pfxBuffer);

    // Encrypt passphrase
    const encPassphrase = encrypt(passphrase);

    // Atomically deactivate old certs and create new one in a transaction
    // to prevent leaving the company without an active certificate if create fails
    const certificate = await this.prisma.client.$transaction(async (tx) => {
      await tx.certificate.updateMany({
        where: { companyId, isActive: true },
        data: { isActive: false },
      });

      return tx.certificate.create({
        data: {
          companyId,
          pfxData: new Uint8Array(encPfx.ciphertext),
          pfxIv: encPfx.iv,
          pfxAuthTag: encPfx.authTag,
          passphrase: encPassphrase.ciphertext,
          passphraseIv: encPassphrase.iv,
          passphraseTag: encPassphrase.authTag,
          serialNumber: info.serialNumber,
          issuer: info.issuer,
          subject: info.subject,
          validFrom: info.validFrom,
          validTo: info.validTo,
          isActive: true,
        },
      });
    });

    // Invalidate cached certificate for this company
    this.certCache.delete(companyId);

    this.logger.log(
      `Certificate uploaded for company ${companyId}: SN=${info.serialNumber}, expires=${info.validTo.toISOString()}`,
    );

    return {
      id: certificate.id,
      serialNumber: certificate.serialNumber,
      issuer: certificate.issuer,
      subject: certificate.subject,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      isActive: certificate.isActive,
    };
  }

  /**
   * Get the active certificate for a company (decrypted PFX + passphrase).
   * Results are cached in memory for 10 minutes to avoid repeated DB queries
   * and AES decryption. Cache is invalidated on certificate upload.
   */
  async getActiveCertificate(companyId: string): Promise<{
    pfxBuffer: Buffer;
    passphrase: string;
    info: CertificateInfo;
  }> {
    // Check in-memory cache first
    const cached = this.certCache.get(companyId);
    if (cached && (Date.now() - cached.cachedAt) < CertificatesService.CERT_CACHE_TTL_MS) {
      return { pfxBuffer: cached.pfxBuffer, passphrase: cached.passphrase, info: cached.info };
    }

    const cert = await this.prisma.client.certificate.findFirst({
      where: { companyId, isActive: true },
    });

    if (!cert) {
      throw new NotFoundException('No active certificate found for this company');
    }

    const pfxBuffer = decryptBuffer(
      Buffer.from(cert.pfxData),
      cert.pfxIv,
      cert.pfxAuthTag,
    );

    const passphrase = decrypt({
      ciphertext: cert.passphrase,
      iv: cert.passphraseIv,
      authTag: cert.passphraseTag,
    });

    const info: CertificateInfo = {
      serialNumber: cert.serialNumber,
      issuer: cert.issuer,
      subject: cert.subject,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
    };

    // Cache the decrypted result
    this.certCache.set(companyId, { pfxBuffer, passphrase, info, cachedAt: Date.now() });

    return { pfxBuffer, passphrase, info };
  }

  /**
   * List certificates for a company (metadata only)
   */
  async findByCompany(companyId: string) {
    return this.prisma.client.certificate.findMany({
      where: { companyId },
      select: {
        id: true,
        serialNumber: true,
        issuer: true,
        subject: true,
        validFrom: true,
        validTo: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Extract certificate info from PFX buffer using node-forge
   */
  private extractCertificateInfo(pfxBuffer: Buffer, passphrase: string): CertificateInfo {
    try {
      const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);

      // Extract certificates
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certs = certBags[forge.pki.oids.certBag];

      if (!certs || certs.length === 0) {
        throw new BadRequestException('No certificates found in PFX file');
      }

      // Get the first certificate (usually the signing cert)
      const cert = certs[0].cert;
      if (!cert) {
        throw new BadRequestException('Could not read certificate from PFX');
      }

      return {
        serialNumber: cert.serialNumber,
        issuer: cert.issuer.attributes
          .map((a: any) => `${a.shortName}=${a.value}`)
          .join(', '),
        subject: cert.subject.attributes
          .map((a: any) => `${a.shortName}=${a.value}`)
          .join(', '),
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Invalid PFX file or wrong passphrase: ${error.message}`,
      );
    }
  }
}
