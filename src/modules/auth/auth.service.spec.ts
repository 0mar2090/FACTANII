import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-001',
    email: 'test@facturape.pe',
    name: 'Test User',
    passwordHash: 'salt:hash',
    isActive: true,
    companyUsers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCompanyUser(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-001',
    companyId: 'comp-001',
    role: 'owner',
    company: { id: 'comp-001', isActive: true },
    ...overrides,
  };
}

// ── Mock Factories ────────────────────────────────────────────────────────────

function createMocks() {
  const prisma = {
    client: {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      companyUser: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      apiKey: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
  };

  const jwtService = {
    signAsync: vi.fn().mockResolvedValue('signed-token'),
    verifyAsync: vi.fn(),
    decode: vi.fn(),
  };

  const configService = {
    get: vi.fn((key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        'jwt.secret': 'test-secret',
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.expiration': '15m',
        'jwt.refreshExpiration': '7d',
      };
      return values[key] ?? fallback;
    }),
  };

  const notifications = {
    sendWelcome: vi.fn().mockResolvedValue(undefined),
  };

  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(900),
  };

  return { prisma, jwtService, configService, notifications, redis };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new AuthService(
    mocks.prisma as any,
    mocks.jwtService as any,
    mocks.configService as any,
    mocks.notifications as any,
    mocks.redis as any,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: AuthService;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should register a new user and return auth tokens with user info', async () => {
      mocks.prisma.client.user.findUnique.mockResolvedValue(null);
      mocks.prisma.client.user.create.mockResolvedValue(
        makeUser({ id: 'user-001', email: 'test@facturape.pe', name: 'Test User' }),
      );
      mocks.jwtService.signAsync.mockResolvedValue('access-token-123');

      const result = await service.register({
        email: 'test@facturape.pe',
        password: 'Test12345!',
        name: 'Test User',
      });

      expect(result.user.email).toBe('test@facturape.pe');
      expect(result.user.name).toBe('Test User');
      expect(result.user.id).toBe('user-001');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should lowercase and trim the email before storing', async () => {
      mocks.prisma.client.user.findUnique.mockResolvedValue(null);
      mocks.prisma.client.user.create.mockResolvedValue(
        makeUser({ email: 'test@facturape.pe' }),
      );

      await service.register({
        email: '  TEST@facturape.PE  ',
        password: 'Test12345!',
        name: 'Test User',
      });

      const createCall = mocks.prisma.client.user.create.mock.calls[0][0];
      expect(createCall.data.email).toBe('test@facturape.pe');
    });

    it('should throw ConflictException when email is already registered', async () => {
      mocks.prisma.client.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.register({
          email: 'test@facturape.pe',
          password: 'Test12345!',
          name: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.register({
          email: 'test@facturape.pe',
          password: 'Test12345!',
          name: 'Test User',
        }),
      ).rejects.toThrow('Email already registered');
    });

    it('should NOT block registration if the welcome email send fails', async () => {
      mocks.prisma.client.user.findUnique.mockResolvedValue(null);
      mocks.prisma.client.user.create.mockResolvedValue(makeUser());
      mocks.notifications.sendWelcome.mockRejectedValue(new Error('Resend API error'));

      // Should not throw even though welcome email fails
      const result = await service.register({
        email: 'test@facturape.pe',
        password: 'Test12345!',
        name: 'Test User',
      });

      expect(result.user.id).toBe('user-001');
    });

    it('should call jwtService.signAsync twice — once for access, once for refresh', async () => {
      mocks.prisma.client.user.findUnique.mockResolvedValue(null);
      mocks.prisma.client.user.create.mockResolvedValue(makeUser());

      await service.register({
        email: 'test@facturape.pe',
        password: 'Test12345!',
        name: 'Test User',
      });

      expect(mocks.jwtService.signAsync).toHaveBeenCalledTimes(2);
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should return tokens and user info for valid credentials', async () => {
      // Build a real password hash so verifyPassword succeeds
      // We call hashPassword-equivalent directly: scrypt with a known salt.
      // Instead, stub verifyPassword by creating a valid hash at test time.
      // We do this by registering first... but here we just need a working hash.
      // The simplest approach: use a pre-computed scrypt hash is brittle.
      // Instead, spy on the private method at runtime.

      // Use a user whose passwordHash is set via an actual hash call.
      // We rely on the fact that AuthService.verifyPassword is private but
      // testable through login — so we create a valid hash first.
      const tempService = createService(mocks);
      // Access the private method via any-cast
      const hash = await (tempService as any).hashPassword('Test12345!');

      mocks.prisma.client.user.findUnique.mockResolvedValue(
        makeUser({
          passwordHash: hash,
          companyUsers: [makeCompanyUser()],
        }),
      );
      mocks.redis.get.mockResolvedValue(null); // no lockout

      const result = await service.login({
        email: 'test@facturape.pe',
        password: 'Test12345!',
      });

      expect(result.user.email).toBe('test@facturape.pe');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Single active company — payload should include companyId
      expect(mocks.jwtService.signAsync).toHaveBeenCalledTimes(2);
    });

    it('should throw UnauthorizedException for an unknown email', async () => {
      mocks.prisma.client.user.findUnique.mockResolvedValue(null);
      mocks.redis.get.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@facturape.pe', password: 'Test12345!' }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.login({ email: 'nobody@facturape.pe', password: 'Test12345!' }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException for a wrong password and record the failed attempt', async () => {
      // Build a valid scrypt hash for a *different* password so that
      // verifyPassword's timingSafeEqual gets buffers of the correct length
      // (64 bytes each) but they do not match.
      const tempService3 = createService(mocks);
      const hashForOtherPassword = await (tempService3 as any).hashPassword('OtherPass!');

      mocks.prisma.client.user.findUnique.mockResolvedValue(
        makeUser({ passwordHash: hashForOtherPassword, companyUsers: [] }),
      );
      mocks.redis.get.mockResolvedValue(null);

      await expect(
        service.login({ email: 'test@facturape.pe', password: 'WrongPass!' }),
      ).rejects.toThrow(UnauthorizedException);

      // redis.incr should have been called to record the failed attempt
      expect(mocks.redis.incr).toHaveBeenCalledWith(
        'login_attempts:test@facturape.pe',
      );
    });

    it('should throw UnauthorizedException with lockout message when account is locked', async () => {
      // Simulate 5 failed attempts already stored in Redis
      mocks.redis.get.mockResolvedValue('5');
      mocks.redis.ttl.mockResolvedValue(600); // 10 minutes remaining

      await expect(
        service.login({ email: 'test@facturape.pe', password: 'Test12345!' }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.login({ email: 'test@facturape.pe', password: 'Test12345!' }),
      ).rejects.toThrow(/Account temporarily locked/i);
    });

    it('should throw UnauthorizedException for a deactivated account', async () => {
      mocks.prisma.client.user.findUnique.mockResolvedValue(
        makeUser({ isActive: false }),
      );
      mocks.redis.get.mockResolvedValue(null);

      await expect(
        service.login({ email: 'test@facturape.pe', password: 'Test12345!' }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.login({ email: 'test@facturape.pe', password: 'Test12345!' }),
      ).rejects.toThrow('Account is deactivated');
    });

    it('should clear failed login attempts on successful login', async () => {
      const tempService2 = createService(mocks);
      const hash = await (tempService2 as any).hashPassword('Test12345!');

      mocks.prisma.client.user.findUnique.mockResolvedValue(
        makeUser({ passwordHash: hash, companyUsers: [] }),
      );
      mocks.redis.get.mockResolvedValue(null);

      await service.login({
        email: 'test@facturape.pe',
        password: 'Test12345!',
      });

      expect(mocks.redis.del).toHaveBeenCalledWith(
        'login_attempts:test@facturape.pe',
      );
    });
  });

  // ── refreshTokens ─────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('should return new tokens when given a valid refresh token', async () => {
      const jwtPayload = {
        sub: 'user-001',
        email: 'test@facturape.pe',
        companyId: 'comp-001',
        role: 'owner',
      };

      mocks.jwtService.verifyAsync.mockResolvedValue(jwtPayload);
      mocks.prisma.client.user.findUnique.mockResolvedValue(
        makeUser({ id: 'user-001', email: 'test@facturape.pe' }),
      );
      mocks.prisma.client.companyUser.findMany.mockResolvedValue([
        makeCompanyUser(),
      ]);
      mocks.jwtService.signAsync.mockResolvedValue('new-access-token');

      const result = await service.refreshTokens('valid-refresh-token');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mocks.jwtService.verifyAsync).toHaveBeenCalledWith(
        'valid-refresh-token',
        expect.objectContaining({ secret: 'test-refresh-secret' }),
      );
    });

    it('should throw UnauthorizedException when refresh token is invalid', async () => {
      mocks.jwtService.verifyAsync.mockRejectedValue(new Error('jwt malformed'));

      await expect(service.refreshTokens('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(service.refreshTokens('bad-token')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should throw UnauthorizedException when the user no longer exists', async () => {
      mocks.jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-gone',
        email: 'gone@facturape.pe',
      });
      mocks.prisma.client.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(service.refreshTokens('valid-token')).rejects.toThrow(
        'User not found or inactive',
      );
    });

    it('should throw UnauthorizedException when the user is inactive', async () => {
      mocks.jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-001',
        email: 'test@facturape.pe',
      });
      mocks.prisma.client.user.findUnique.mockResolvedValue(
        makeUser({ isActive: false }),
      );

      await expect(service.refreshTokens('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── logout ────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should add the token jti to the Redis blacklist with TTL', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 900; // 15 minutes from now
      mocks.jwtService.decode.mockReturnValue({
        jti: 'token-jti-abc',
        exp: futureExp,
        sub: 'user-001',
      });

      await service.logout('some-access-token');

      expect(mocks.redis.set).toHaveBeenCalledWith(
        'jwt_blacklist:token-jti-abc',
        '1',
        'EX',
        expect.any(Number),
      );
      // TTL should be positive
      const ttlArg = (mocks.redis.set.mock.calls[0] as any[])[3] as number;
      expect(ttlArg).toBeGreaterThan(0);
    });

    it('should NOT blacklist an already-expired token (TTL <= 0)', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60; // already expired
      mocks.jwtService.decode.mockReturnValue({
        jti: 'old-jti',
        exp: pastExp,
        sub: 'user-001',
      });

      await service.logout('expired-access-token');

      expect(mocks.redis.set).not.toHaveBeenCalled();
    });

    it('should silently ignore a malformed token', async () => {
      mocks.jwtService.decode.mockReturnValue(null);

      await expect(service.logout('garbage-token')).resolves.not.toThrow();
      expect(mocks.redis.set).not.toHaveBeenCalled();
    });
  });

  // ── createApiKey ──────────────────────────────────────────────────────────

  describe('createApiKey', () => {
    it('should create and return an API key with prefix and name', async () => {
      mocks.prisma.client.companyUser.findUnique.mockResolvedValue(
        makeCompanyUser(),
      );
      mocks.prisma.client.apiKey.create.mockResolvedValue({
        id: 'key-001',
        prefix: 'fpe_test',
        name: 'My Key',
      });

      const result = await service.createApiKey('user-001', 'comp-001', {
        name: 'My Key',
      });

      expect(result.key).toMatch(/^fpe_/);
      expect(result.prefix).toBe(result.key.substring(0, 8));
      expect(result.name).toBe('My Key');
    });

    it('should store only the hashed key — never the plain-text key', async () => {
      mocks.prisma.client.companyUser.findUnique.mockResolvedValue(
        makeCompanyUser(),
      );
      mocks.prisma.client.apiKey.create.mockResolvedValue({
        id: 'key-001',
        prefix: 'fpe_xxxx',
        name: 'Secure Key',
      });

      const result = await service.createApiKey('user-001', 'comp-001', {
        name: 'Secure Key',
      });

      const createArg = mocks.prisma.client.apiKey.create.mock.calls[0][0];
      // The stored keyHash must NOT equal the plain text key
      expect(createArg.data.keyHash).not.toBe(result.key);
      // keyHash should be a 64-char hex string (SHA-256 via HMAC)
      expect(createArg.data.keyHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should throw NotFoundException when user is not a member of the company', async () => {
      mocks.prisma.client.companyUser.findUnique.mockResolvedValue(null);

      await expect(
        service.createApiKey('user-001', 'comp-999', { name: 'Key' }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.createApiKey('user-001', 'comp-999', { name: 'Key' }),
      ).rejects.toThrow('User is not a member of this company');
    });

    it('should respect an optional expiresAt date', async () => {
      mocks.prisma.client.companyUser.findUnique.mockResolvedValue(
        makeCompanyUser(),
      );
      mocks.prisma.client.apiKey.create.mockResolvedValue({
        id: 'key-002',
        prefix: 'fpe_yyyy',
        name: 'Expiring Key',
      });

      const expiresAt = '2027-01-01T00:00:00.000Z';
      await service.createApiKey('user-001', 'comp-001', {
        name: 'Expiring Key',
        expiresAt,
      });

      const createArg = mocks.prisma.client.apiKey.create.mock.calls[0][0];
      expect(createArg.data.expiresAt).toEqual(new Date(expiresAt));
    });

    it('should set expiresAt to null when no expiry is provided', async () => {
      mocks.prisma.client.companyUser.findUnique.mockResolvedValue(
        makeCompanyUser(),
      );
      mocks.prisma.client.apiKey.create.mockResolvedValue({
        id: 'key-003',
        prefix: 'fpe_zzzz',
        name: 'Permanent Key',
      });

      await service.createApiKey('user-001', 'comp-001', {
        name: 'Permanent Key',
      });

      const createArg = mocks.prisma.client.apiKey.create.mock.calls[0][0];
      expect(createArg.data.expiresAt).toBeNull();
    });
  });

  // ── isTokenRevoked ────────────────────────────────────────────────────────

  describe('isTokenRevoked', () => {
    it('should return true when the jti is in the Redis blacklist', async () => {
      mocks.redis.get.mockResolvedValue('1');

      const result = await service.isTokenRevoked('revoked-jti');

      expect(result).toBe(true);
      expect(mocks.redis.get).toHaveBeenCalledWith('jwt_blacklist:revoked-jti');
    });

    it('should return false when the jti is not in the blacklist', async () => {
      mocks.redis.get.mockResolvedValue(null);

      const result = await service.isTokenRevoked('active-jti');

      expect(result).toBe(false);
    });

    it('should return false (fail open) when Redis is unavailable', async () => {
      mocks.redis.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.isTokenRevoked('some-jti');

      // Fail open: returns false so requests are not blocked
      expect(result).toBe(false);
    });
  });
});
