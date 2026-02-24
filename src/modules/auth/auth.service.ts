import {
  Injectable,
  Inject,
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
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { RegisterDto, LoginDto, CreateApiKeyDto, ChangePasswordDto } from './dto/index.js';
import type { JwtPayload } from '../../common/interfaces/index.js';

const scryptAsync = promisify(scrypt);

/** Max failed login attempts before lockout */
const MAX_LOGIN_ATTEMPTS = 5;
/** Lockout window in seconds (15 minutes) */
const LOCKOUT_WINDOW_SECONDS = 900;

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
    private readonly notifications: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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

    // Send welcome email (fire-and-forget — don't block registration)
    void this.notifications.sendWelcome(user.email, user.name).catch((err) => {
      this.logger.warn(`Failed to send welcome email to ${user.email}: ${err.message}`);
    });

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
    const email = dto.email.toLowerCase().trim();

    // Check account lockout
    await this.checkLockout(email);

    const user = await this.prisma.client.user.findUnique({
      where: { email },
      include: {
        companyUsers: {
          include: {
            company: { select: { id: true, isActive: true } },
          },
        },
      },
    });

    if (!user) {
      this.logger.warn(`Login failed: unknown email ${email}`);
      await this.recordFailedAttempt(email);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      this.logger.warn(`Login failed: deactivated account ${email} (${user.id})`);
      throw new UnauthorizedException('Account is deactivated');
    }

    const isValid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      this.logger.warn(`Login failed: bad password for ${email} (${user.id})`);
      await this.recordFailedAttempt(email);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Successful login — clear failed attempts
    await this.clearFailedAttempts(email);

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

  /**
   * Change the current user's password.
   * Requires the current password for verification.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isValid = await this.verifyPassword(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await this.hashPassword(dto.newPassword);
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    this.logger.log(`Password changed for user ${userId}`);
  }

  /**
   * Revoke a JWT token by adding its jti to the Redis blacklist.
   * TTL matches the token's remaining lifetime so keys auto-expire.
   */
  async logout(accessToken: string): Promise<void> {
    try {
      const payload = this.jwtService.decode(accessToken) as JwtPayload | null;
      if (payload?.jti && payload?.exp) {
        const ttl = payload.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await this.redis.set(`jwt_blacklist:${payload.jti}`, '1', 'EX', ttl);
        }
      }
    } catch {
      // Token is malformed or already expired — nothing to blacklist
    }
  }

  /**
   * Check if a JWT token has been revoked.
   */
  async isTokenRevoked(jti: string): Promise<boolean> {
    const result = await this.redis.get(`jwt_blacklist:${jti}`);
    return result !== null;
  }

  // ─── Login Lockout ──────────────────────────────────────────────────

  private loginAttemptsKey(email: string): string {
    return `login_attempts:${email}`;
  }

  private async checkLockout(email: string): Promise<void> {
    const attempts = await this.redis.get(this.loginAttemptsKey(email));
    if (attempts && parseInt(attempts, 10) >= MAX_LOGIN_ATTEMPTS) {
      const ttl = await this.redis.ttl(this.loginAttemptsKey(email));
      const minutes = Math.ceil(ttl / 60);
      this.logger.warn(`Account locked: ${email} (${attempts} failed attempts)`);
      throw new UnauthorizedException(
        `Account temporarily locked due to too many failed attempts. Try again in ${minutes} minute(s).`,
      );
    }
  }

  private async recordFailedAttempt(email: string): Promise<void> {
    const key = this.loginAttemptsKey(email);
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, LOCKOUT_WINDOW_SECONDS);
    }
    if (current >= MAX_LOGIN_ATTEMPTS) {
      this.logger.warn(`Account locked after ${current} failed attempts: ${email}`);
    }
  }

  private async clearFailedAttempts(email: string): Promise<void> {
    await this.redis.del(this.loginAttemptsKey(email));
  }

  // ─── Private Methods ─────────────────────────────────────────────────

  /**
   * Generate an access + refresh token pair from a JWT payload.
   *
   * Access token: short-lived (default 15m), used for API requests.
   * Refresh token: longer-lived (default 7d), used to obtain new access tokens.
   */
  private async generateTokens(payload: JwtPayload): Promise<AuthTokens> {
    const accessJti = randomBytes(16).toString('hex');
    const refreshJti = randomBytes(16).toString('hex');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: payload.sub,
          email: payload.email,
          companyId: payload.companyId,
          role: payload.role,
          jti: accessJti,
        },
        {
          secret: this.config.get<string>('jwt.secret'),
          expiresIn: this.config.get('jwt.expiration', '15m') as any,
        },
      ),
      this.jwtService.signAsync(
        {
          sub: payload.sub,
          email: payload.email,
          companyId: payload.companyId,
          role: payload.role,
          jti: refreshJti,
        },
        {
          secret: this.config.get<string>('jwt.refreshSecret'),
          expiresIn: this.config.get('jwt.refreshExpiration', '7d') as any,
        },
      ),
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
