import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { encrypt, decrypt } from '../../common/utils/encryption.js';
import { isValidRuc } from '../../common/utils/ruc-validator.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { UpdateSolCredentialsDto } from './dto/update-sol-credentials.dto.js';

/** Cached SOL credentials with TTL tracking */
interface CachedSolCreds {
  solUser: string;
  solPass: string;
  cachedAt: number;
}

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  /** In-memory SOL credentials cache keyed by companyId, 5-minute TTL */
  private readonly solCredsCache = new Map<string, CachedSolCreds>();
  private static readonly SOL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCompanyDto) {
    if (!isValidRuc(dto.ruc)) {
      throw new ConflictException('Invalid RUC (module 11 check failed)');
    }

    // Check if RUC already exists
    const existing = await this.prisma.client.company.findUnique({
      where: { ruc: dto.ruc },
    });
    if (existing) {
      throw new ConflictException(`Company with RUC ${dto.ruc} already exists`);
    }

    // Create company and assign user as owner in a transaction
    return this.prisma.withTransaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          ruc: dto.ruc,
          razonSocial: dto.razonSocial,
          nombreComercial: dto.nombreComercial,
          direccion: dto.direccion,
          ubigeo: dto.ubigeo,
          departamento: dto.departamento,
          provincia: dto.provincia,
          distrito: dto.distrito,
          urbanizacion: dto.urbanizacion,
        },
      });

      await tx.companyUser.create({
        data: {
          userId,
          companyId: company.id,
          role: 'owner',
        },
      });

      this.logger.log(`Company created: ${company.ruc} — ${company.razonSocial}`);
      return company;
    });
  }

  async findById(id: string) {
    const company = await this.prisma.client.company.findUnique({
      where: { id },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return this.sanitizeCompany(company);
  }

  async findByUser(userId: string) {
    const companyUsers = await this.prisma.client.companyUser.findMany({
      where: { userId },
      include: {
        company: true,
      },
    });

    return companyUsers.map((cu: { role: string; company: any }) => ({
      ...this.sanitizeCompany(cu.company),
      role: cu.role,
    }));
  }

  async update(companyId: string, dto: UpdateCompanyDto) {
    await this.ensureExists(companyId);

    const company = await this.prisma.client.company.update({
      where: { id: companyId },
      data: {
        ...(dto.razonSocial !== undefined && { razonSocial: dto.razonSocial }),
        ...(dto.nombreComercial !== undefined && { nombreComercial: dto.nombreComercial }),
        ...(dto.direccion !== undefined && { direccion: dto.direccion }),
        ...(dto.ubigeo !== undefined && { ubigeo: dto.ubigeo }),
        ...(dto.departamento !== undefined && { departamento: dto.departamento }),
        ...(dto.provincia !== undefined && { provincia: dto.provincia }),
        ...(dto.distrito !== undefined && { distrito: dto.distrito }),
        ...(dto.urbanizacion !== undefined && { urbanizacion: dto.urbanizacion }),
        ...(dto.serieFactura !== undefined && { serieFactura: dto.serieFactura }),
        ...(dto.serieBoleta !== undefined && { serieBoleta: dto.serieBoleta }),
      },
    });

    return this.sanitizeCompany(company);
  }

  async updateSolCredentials(companyId: string, dto: UpdateSolCredentialsDto) {
    await this.ensureExists(companyId);

    // Encrypt both values as a single JSON payload
    const combined = JSON.stringify({ user: dto.solUser, pass: dto.solPass });
    const enc = encrypt(combined);

    const company = await this.prisma.client.company.update({
      where: { id: companyId },
      data: {
        solUser: enc.ciphertext,
        solPass: null, // Combined in solUser ciphertext
        solIv: enc.iv,
        solTag: enc.authTag,
      },
    });

    // Invalidate cached credentials
    this.solCredsCache.delete(companyId);

    this.logger.log(`SOL credentials updated for company ${companyId}`);
    return { message: 'SOL credentials updated' };
  }

  async getSolCredentials(companyId: string): Promise<{ solUser: string; solPass: string } | null> {
    // Check in-memory cache first
    const cached = this.solCredsCache.get(companyId);
    if (cached && (Date.now() - cached.cachedAt) < CompaniesService.SOL_CACHE_TTL_MS) {
      return { solUser: cached.solUser, solPass: cached.solPass };
    }

    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
      select: { solUser: true, solPass: true, solIv: true, solTag: true },
    });

    if (!company?.solUser || !company?.solIv || !company?.solTag) {
      return null;
    }

    const decrypted = decrypt({
      ciphertext: company.solUser,
      iv: company.solIv,
      authTag: company.solTag,
    });

    const parsed = JSON.parse(decrypted) as { user: string; pass: string };
    const result = { solUser: parsed.user, solPass: parsed.pass };

    // Cache the decrypted credentials
    this.solCredsCache.set(companyId, { ...result, cachedAt: Date.now() });

    return result;
  }

  async ensureUserBelongs(userId: string, companyId: string): Promise<string> {
    const cu = await this.prisma.client.companyUser.findUnique({
      where: {
        userId_companyId: { userId, companyId },
      },
    });
    if (!cu) {
      throw new NotFoundException('User does not belong to this company');
    }
    return cu.role;
  }

  private async ensureExists(companyId: string) {
    const exists = await this.prisma.client.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Company not found');
    }
  }

  /** Strip encrypted fields from company responses */
  private sanitizeCompany(company: any) {
    const { solUser, solPass, solIv, solTag, ...safe } = company;
    return {
      ...safe,
      // Credentials are combined into solUser ciphertext (solPass is null),
      // so check for the encryption metadata fields instead.
      hasSolCredentials: !!(solUser && solIv && solTag),
    };
  }
}
