import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto, LoginDto, CreateApiKeyDto } from './dto/index.js';
import type { JwtPayload } from '../../common/interfaces/index.js';

const scryptAsync = promisify(scrypt);

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface ApiKeyResponse {
  key: string;
  prefix: string;
  name: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Register a new user account.
   *
   * Creates the user with a scrypt-hashed password and returns JWT tokens.
   * Does NOT create a company — the user must create or join one separately.
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    // Check if email already exists
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        name: dto.name.trim(),
      },
    });

    this.logger.log(`User registered: ${user.email} (${user.id})`);

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  /**
   * Authenticate a user with email and password.
   *
   * Validates credentials and returns JWT tokens. If the user belongs to
   * exactly one company, the companyId and role are included in the tokens.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: {
        companyUsers: {
          include: {
            company: { select: { id: true, isActive: true } },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isValid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // If user belongs to exactly one active company, include it in the token
    const activeCompanies = user.companyUsers.filter(
      (cu: { companyId: string; role: string; company: { id: string; isActive: boolean } }) =>
        cu.company.isActive,
    );

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    if (activeCompanies.length === 1) {
      payload.companyId = activeCompanies[0]!.companyId;
      payload.role = activeCompanies[0]!.role;
    }

    this.logger.log(`User logged in: ${user.email} (${user.id})`);

    const tokens = await this.generateTokens(payload);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  /**
   * Refresh an expired access token using a valid refresh token.
   *
   * Validates the refresh token signature, checks the user still exists
   * and is active, then issues a fresh token pair (rotation).
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Verify user still exists and is active
    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Re-check company membership for fresh token
    const companyUsers = await this.prisma.client.companyUser.findMany({
      where: { userId: user.id },
      include: {
        company: { select: { id: true, isActive: true } },
      },
    });

    type CuWithCompany = { companyId: string; role: string; company: { id: string; isActive: boolean } };
    const activeCompanies = companyUsers.filter(
      (cu: CuWithCompany) => cu.company.isActive,
    );

    const newPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    // Preserve existing companyId if still valid, otherwise pick single company
    if (payload.companyId) {
      const stillValid = activeCompanies.find(
        (cu: CuWithCompany) => cu.companyId === payload.companyId,
      );
      if (stillValid) {
        newPayload.companyId = stillValid.companyId;
        newPayload.role = stillValid.role;
      }
    } else if (activeCompanies.length === 1) {
      newPayload.companyId = activeCompanies[0]!.companyId;
      newPayload.role = activeCompanies[0]!.role;
    }

    return this.generateTokens(newPayload);
  }

  /**
   * Create an API key for a user within a specific company.
   *
   * Generates a random 40-byte hex key prefixed with "fpe_". The key is
   * only returned once in plain text. Only the SHA-256 hash is stored in
   * the database for validation.
   *
   * @returns The plain-text key (shown once), its prefix, and name
   */
  async createApiKey(
    userId: string,
    companyId: string,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyResponse> {
    // Verify user belongs to this company
    const companyUser = await this.prisma.client.companyUser.findUnique({
      where: {
        userId_companyId: { userId, companyId },
      },
    });

    if (!companyUser) {
      throw new NotFoundException('User is not a member of this company');
    }

    // Generate a random API key: "fpe_" + 40 random hex bytes
    const rawKey = randomBytes(40).toString('hex');
    const plainKey = `fpe_${rawKey}`;
    const prefix = plainKey.substring(0, 8);
    const keyHash = createHash('sha256').update(plainKey).digest('hex');

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    await this.prisma.client.apiKey.create({
      data: {
        userId,
        companyId,
        keyHash,
        prefix,
        name: dto.name.trim(),
        expiresAt,
      },
    });

    this.logger.log(
      `API key created: ${prefix}... for user ${userId} in company ${companyId}`,
    );

    return {
      key: plainKey,
      prefix,
      name: dto.name.trim(),
    };
  }

  /**
   * Soft-delete an API key.
   *
   * Sets isActive to false. Only the key owner or a company admin can delete.
   */
  async deleteApiKey(id: string, userId: string): Promise<void> {
    const apiKey = await this.prisma.client.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    if (apiKey.userId !== userId) {
      // Check if user is owner/admin of the same company
      const companyUser = await this.prisma.client.companyUser.findUnique({
        where: {
          userId_companyId: {
            userId,
            companyId: apiKey.companyId,
          },
        },
      });

      if (!companyUser || !['owner', 'admin'].includes(companyUser.role)) {
        throw new UnauthorizedException(
          'You can only delete your own API keys or be an admin/owner',
        );
      }
    }

    await this.prisma.client.apiKey.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`API key deleted: ${apiKey.prefix}... (${id})`);
  }

  // ─── Private Methods ─────────────────────────────────────────────────

  /**
   * Generate an access + refresh token pair from a JWT payload.
   *
   * Access token: short-lived (default 15m), used for API requests.
   * Refresh token: longer-lived (default 7d), used to obtain new access tokens.
   */
  private async generateTokens(payload: JwtPayload): Promise<AuthTokens> {
    const tokenPayload = {
      sub: payload.sub,
      email: payload.email,
      companyId: payload.companyId,
      role: payload.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(tokenPayload, {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: this.config.get('jwt.expiration', '15m') as any,
      }),
      this.jwtService.signAsync(tokenPayload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpiration', '7d') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Hash a password using scrypt with a random 16-byte salt.
   *
   * Format: `{salt_hex}:{derived_key_hex}`
   * Key length: 64 bytes (512 bits)
   */
  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /**
   * Verify a password against a scrypt hash using timing-safe comparison.
   */
  private async verifyPassword(
    password: string,
    hash: string,
  ): Promise<boolean> {
    const [salt, key] = hash.split(':');
    if (!salt || !key) {
      return false;
    }
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    const keyBuffer = Buffer.from(key, 'hex');
    return timingSafeEqual(derivedKey, keyBuffer);
  }
}
