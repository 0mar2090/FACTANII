import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface MigrationCheckResult {
  ready: boolean;
  company: {
    id: string;
    ruc: string;
    razonSocial: string;
    isBeta: boolean;
  };
  checks: {
    hasSolCredentials: boolean;
    hasActiveCertificate: boolean;
    certificateNotExpired: boolean;
    hasActiveSubscription: boolean;
  };
  issues: string[];
}

export interface MigrationResult {
  success: boolean;
  companyId: string;
  ruc: string;
  previousMode: string;
  currentMode: string;
  migratedAt: string;
}

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a company is ready to migrate from beta to production.
   * Returns detailed check results without making any changes.
   */
  async checkMigrationReadiness(companyId: string): Promise<MigrationCheckResult> {
    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
      include: {
        certificates: { where: { isActive: true } },
        subscription: { include: { plan: true } },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    const issues: string[] = [];

    // Check SOL credentials
    const hasSolCredentials = !!(company.solUser && company.solPass);
    if (!hasSolCredentials) {
      issues.push('Missing SOL credentials (solUser/solPass). Configure them before migrating.');
    }

    // Check active certificate
    const activeCert = company.certificates[0];
    const hasActiveCertificate = !!activeCert;
    if (!hasActiveCertificate) {
      issues.push('No active digital certificate found. Upload a valid .pfx certificate.');
    }

    // Check certificate expiration
    const now = new Date();
    const certificateNotExpired = hasActiveCertificate && activeCert.validTo > now;
    if (hasActiveCertificate && !certificateNotExpired) {
      issues.push(`Certificate expired on ${activeCert.validTo.toISOString()}. Upload a new certificate.`);
    }

    // Check active subscription
    const hasActiveSubscription = !!(company.subscription && company.subscription.status === 'active');
    if (!hasActiveSubscription) {
      issues.push('No active subscription. Subscribe to a plan before migrating to production.');
    }

    const ready = hasSolCredentials && hasActiveCertificate && certificateNotExpired && hasActiveSubscription;

    return {
      ready,
      company: {
        id: company.id,
        ruc: company.ruc,
        razonSocial: company.razonSocial,
        isBeta: company.isBeta,
      },
      checks: {
        hasSolCredentials,
        hasActiveCertificate,
        certificateNotExpired,
        hasActiveSubscription,
      },
      issues,
    };
  }

  /**
   * Migrate a company from beta to production.
   * Runs readiness checks first, then flips the isBeta flag.
   */
  async migrateToProduction(companyId: string): Promise<MigrationResult> {
    const readiness = await this.checkMigrationReadiness(companyId);

    if (!readiness.ready) {
      throw new BadRequestException({
        message: 'Company is not ready for production migration',
        issues: readiness.issues,
      });
    }

    if (!readiness.company.isBeta) {
      throw new BadRequestException('Company is already in production mode');
    }

    // Flip the flag
    await this.prisma.client.company.update({
      where: { id: companyId },
      data: { isBeta: false },
    });

    const result: MigrationResult = {
      success: true,
      companyId,
      ruc: readiness.company.ruc,
      previousMode: 'beta',
      currentMode: 'production',
      migratedAt: new Date().toISOString(),
    };

    this.logger.log(
      `Company ${readiness.company.ruc} (${companyId}) migrated to PRODUCTION`,
    );

    return result;
  }

  /**
   * Revert a company from production back to beta (emergency rollback).
   */
  async revertToBeta(companyId: string): Promise<MigrationResult> {
    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    if (company.isBeta) {
      throw new BadRequestException('Company is already in beta mode');
    }

    await this.prisma.client.company.update({
      where: { id: companyId },
      data: { isBeta: true },
    });

    this.logger.warn(
      `Company ${company.ruc} (${companyId}) REVERTED to beta mode`,
    );

    return {
      success: true,
      companyId,
      ruc: company.ruc,
      previousMode: 'production',
      currentMode: 'beta',
      migratedAt: new Date().toISOString(),
    };
  }
}
