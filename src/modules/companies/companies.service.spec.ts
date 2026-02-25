import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service.js';

// ── vi.mock for external utilities ───────────────────────────────────────────
// Mock the encryption module and ruc-validator before importing the service
// so that every call to encrypt/decrypt/isValidRuc goes through our stubs.

vi.mock('../../common/utils/encryption.js', () => ({
  encrypt: vi.fn(() => ({
    ciphertext: 'encrypted-ciphertext',
    iv: 'aabbccdd00112233aabbccdd',
    authTag: '00112233aabbccdd00112233aabbccdd',
  })),
  decrypt: vi.fn(() => JSON.stringify({ user: 'MODDATOS', pass: 'moddatos' })),
}));

vi.mock('../../common/utils/ruc-validator.js', () => ({
  isValidRuc: vi.fn(() => true),
}));

// Import the mocked helpers AFTER vi.mock so we can assert on them.
import { encrypt, decrypt } from '../../common/utils/encryption.js';
import { isValidRuc } from '../../common/utils/ruc-validator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comp-001',
    ruc: '20000000001',
    razonSocial: 'Test SAC',
    nombreComercial: null,
    direccion: 'Av. Lima 123',
    ubigeo: '150101',
    departamento: 'LIMA',
    provincia: 'LIMA',
    distrito: 'LIMA',
    urbanizacion: null,
    isActive: true,
    isBeta: true,
    serieFactura: 'F001',
    serieBoleta: 'B001',
    serieNCFactura: 'FC01',
    serieNDFactura: 'FD01',
    serieNCBoleta: 'BC01',
    serieNDBoleta: 'BD01',
    serieRetencion: 'R001',
    seriePercepcion: 'P001',
    serieGuiaRemision: 'T001',
    nextCorrelativo: {},
    // SOL credential fields — null means no credentials set
    solUser: null,
    solPass: null,
    solIv: null,
    solTag: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Mock Factories ────────────────────────────────────────────────────────────

function createMocks() {
  const txClient = {
    company: {
      create: vi.fn(),
    },
    companyUser: {
      create: vi.fn(),
    },
  };

  const prisma = {
    client: {
      company: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      companyUser: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
    },
    withTransaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
  };

  return { prisma, txClient };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new CompaniesService(mocks.prisma as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CompaniesService', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: CompaniesService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createMocks();
    service = createService(mocks);
    // Default: isValidRuc returns true
    vi.mocked(isValidRuc).mockReturnValue(true);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a company and assign the user as owner inside a transaction', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue(null);
      const createdCompany = makeCompany();
      mocks.txClient.company.create.mockResolvedValue(createdCompany);
      mocks.txClient.companyUser.create.mockResolvedValue({});

      const result = await service.create('user-001', {
        ruc: '20000000001',
        razonSocial: 'Test SAC',
        direccion: 'Av. Lima 123',
        ubigeo: '150101',
        departamento: 'LIMA',
        provincia: 'LIMA',
        distrito: 'LIMA',
      });

      expect(result.id).toBe('comp-001');
      expect(result.ruc).toBe('20000000001');
      // withTransaction was called
      expect(mocks.prisma.withTransaction).toHaveBeenCalledOnce();
      // company.create was called inside the tx
      expect(mocks.txClient.company.create).toHaveBeenCalledOnce();
      // companyUser.create was called to assign owner role
      const cuArg = mocks.txClient.companyUser.create.mock.calls[0][0];
      expect(cuArg.data.userId).toBe('user-001');
      expect(cuArg.data.companyId).toBe('comp-001');
      expect(cuArg.data.role).toBe('owner');
    });

    it('should throw ConflictException for an invalid RUC (module 11)', async () => {
      vi.mocked(isValidRuc).mockReturnValue(false);

      await expect(
        service.create('user-001', {
          ruc: '12345678901',
          razonSocial: 'Bad RUC SAC',
          direccion: 'Somewhere',
          ubigeo: '150101',
          departamento: 'LIMA',
          provincia: 'LIMA',
          distrito: 'LIMA',
        }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.create('user-001', {
          ruc: '12345678901',
          razonSocial: 'Bad RUC SAC',
          direccion: 'Somewhere',
          ubigeo: '150101',
          departamento: 'LIMA',
          provincia: 'LIMA',
          distrito: 'LIMA',
        }),
      ).rejects.toThrow('Invalid RUC');
    });

    it('should throw ConflictException when the RUC is already registered', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue(makeCompany());

      await expect(
        service.create('user-001', {
          ruc: '20000000001',
          razonSocial: 'Duplicate SAC',
          direccion: 'Av. Lima 123',
          ubigeo: '150101',
          departamento: 'LIMA',
          provincia: 'LIMA',
          distrito: 'LIMA',
        }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.create('user-001', {
          ruc: '20000000001',
          razonSocial: 'Duplicate SAC',
          direccion: 'Av. Lima 123',
          ubigeo: '150101',
          departamento: 'LIMA',
          provincia: 'LIMA',
          distrito: 'LIMA',
        }),
      ).rejects.toThrow(/already exists/i);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update allowed company fields and return the sanitized company', async () => {
      // ensureExists succeeds
      mocks.prisma.client.company.findUnique.mockResolvedValueOnce(
        makeCompany({ id: 'comp-001' }),
      );
      const updated = makeCompany({
        razonSocial: 'Updated SAC',
        serieFactura: 'F002',
      });
      mocks.prisma.client.company.update.mockResolvedValue(updated);

      const result = await service.update('comp-001', {
        razonSocial: 'Updated SAC',
        serieFactura: 'F002',
      });

      expect(result.razonSocial).toBe('Updated SAC');
      expect(result.serieFactura).toBe('F002');
      // Encrypted SOL fields must be stripped from the response
      expect(result).not.toHaveProperty('solUser');
      expect(result).not.toHaveProperty('solPass');
      expect(result).not.toHaveProperty('solIv');
      expect(result).not.toHaveProperty('solTag');
    });

    it('should throw NotFoundException when the company does not exist', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue(null);

      await expect(
        service.update('comp-999', { razonSocial: 'Ghost SAC' }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.update('comp-999', { razonSocial: 'Ghost SAC' }),
      ).rejects.toThrow('Company not found');
    });

    it('should include hasSolCredentials=false when no SOL creds are stored', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValueOnce(
        makeCompany(),
      );
      mocks.prisma.client.company.update.mockResolvedValue(
        makeCompany({ solUser: null, solIv: null, solTag: null }),
      );

      const result = await service.update('comp-001', {});

      expect(result.hasSolCredentials).toBe(false);
    });

    it('should include hasSolCredentials=true when SOL creds are stored', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValueOnce(
        makeCompany({ id: 'comp-001' }),
      );
      mocks.prisma.client.company.update.mockResolvedValue(
        makeCompany({
          solUser: 'encrypted-ciphertext',
          solIv: 'aabbccdd',
          solTag: '00112233',
        }),
      );

      const result = await service.update('comp-001', {});

      expect(result.hasSolCredentials).toBe(true);
    });
  });

  // ── updateSolCredentials ───────────────────────────────────────────────────

  describe('updateSolCredentials', () => {
    it('should encrypt SOL credentials and store them, returning a success message', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue(
        makeCompany({ id: 'comp-001' }),
      );
      mocks.prisma.client.company.update.mockResolvedValue(
        makeCompany({
          solUser: 'encrypted-ciphertext',
          solIv: 'aabbccdd00112233aabbccdd',
          solTag: '00112233aabbccdd00112233aabbccdd',
        }),
      );

      const result = await service.updateSolCredentials('comp-001', {
        solUser: 'MODDATOS',
        solPass: 'moddatos',
      });

      expect(result).toEqual({ message: 'SOL credentials updated' });
      // encrypt should have been called with the combined JSON
      expect(encrypt).toHaveBeenCalledOnce();
      const encryptArg = vi.mocked(encrypt).mock.calls[0][0];
      expect(encryptArg).toContain('MODDATOS');
      expect(encryptArg).toContain('moddatos');
    });

    it('should store ciphertext in solUser and null in solPass (combined pattern)', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue(makeCompany());
      mocks.prisma.client.company.update.mockResolvedValue(makeCompany());

      await service.updateSolCredentials('comp-001', {
        solUser: 'MODDATOS',
        solPass: 'moddatos',
      });

      const updateArg = mocks.prisma.client.company.update.mock.calls[0][0];
      expect(updateArg.data.solUser).toBe('encrypted-ciphertext');
      expect(updateArg.data.solPass).toBeNull();
      expect(updateArg.data.solIv).toBe('aabbccdd00112233aabbccdd');
      expect(updateArg.data.solTag).toBe('00112233aabbccdd00112233aabbccdd');
    });

    it('should invalidate the in-memory SOL credentials cache on update', async () => {
      // First, prime the cache by calling getSolCredentials
      mocks.prisma.client.company.findUnique
        .mockResolvedValueOnce(
          makeCompany({
            solUser: 'old-ciphertext',
            solIv: 'aabbccdd00112233aabbccdd',
            solTag: '00112233aabbccdd00112233aabbccdd',
          }),
        )
        .mockResolvedValueOnce(makeCompany()); // ensureExists in updateSolCredentials

      vi.mocked(decrypt).mockReturnValue(
        JSON.stringify({ user: 'OLD_USER', pass: 'old_pass' }),
      );

      await service.getSolCredentials('comp-001');

      // Now update credentials
      mocks.prisma.client.company.update.mockResolvedValue(makeCompany());
      vi.mocked(encrypt).mockReturnValue({
        ciphertext: 'new-ciphertext',
        iv: 'new-iv-hex',
        authTag: 'new-tag-hex',
      });

      await service.updateSolCredentials('comp-001', {
        solUser: 'NEWUSER',
        solPass: 'newpass',
      });

      // After invalidation, the next getSolCredentials should hit the DB again
      mocks.prisma.client.company.findUnique.mockResolvedValueOnce(
        makeCompany({
          solUser: 'new-ciphertext',
          solIv: 'new-iv-hex',
          solTag: 'new-tag-hex',
        }),
      );
      vi.mocked(decrypt).mockReturnValue(
        JSON.stringify({ user: 'NEWUSER', pass: 'newpass' }),
      );

      const creds = await service.getSolCredentials('comp-001');
      expect(creds?.solUser).toBe('NEWUSER');
      // DB was queried again (2nd getSolCredentials call hits DB because cache was cleared)
      // findUnique call count for the creds fetch: once for prime + once after invalidation
      expect(mocks.prisma.client.company.findUnique).toHaveBeenCalledTimes(3);
    });

    it('should throw NotFoundException when updating SOL creds for a missing company', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue(null);

      await expect(
        service.updateSolCredentials('comp-999', {
          solUser: 'USER',
          solPass: 'pass',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getSolCredentials ──────────────────────────────────────────────────────

  describe('getSolCredentials', () => {
    it('should decrypt and return SOL credentials when they exist', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue({
        solUser: 'encrypted-ciphertext',
        solPass: null,
        solIv: 'aabbccdd00112233aabbccdd',
        solTag: '00112233aabbccdd00112233aabbccdd',
      });
      vi.mocked(decrypt).mockReturnValue(
        JSON.stringify({ user: 'MODDATOS', pass: 'moddatos' }),
      );

      const result = await service.getSolCredentials('comp-001');

      expect(result).toEqual({ solUser: 'MODDATOS', solPass: 'moddatos' });
      expect(decrypt).toHaveBeenCalledOnce();
    });

    it('should return null when no SOL credentials have been set', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue({
        solUser: null,
        solPass: null,
        solIv: null,
        solTag: null,
      });

      const result = await service.getSolCredentials('comp-001');

      expect(result).toBeNull();
      expect(decrypt).not.toHaveBeenCalled();
    });

    it('should serve credentials from the in-memory cache on a second call', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue({
        solUser: 'encrypted-ciphertext',
        solPass: null,
        solIv: 'aabbccdd00112233aabbccdd',
        solTag: '00112233aabbccdd00112233aabbccdd',
      });
      vi.mocked(decrypt).mockReturnValue(
        JSON.stringify({ user: 'MODDATOS', pass: 'moddatos' }),
      );

      const first = await service.getSolCredentials('comp-001');
      const second = await service.getSolCredentials('comp-001');

      expect(first).toEqual(second);
      // DB was only queried once; second call hit the cache
      expect(mocks.prisma.client.company.findUnique).toHaveBeenCalledTimes(1);
      expect(decrypt).toHaveBeenCalledTimes(1);
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return the sanitized company when it exists', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue(makeCompany());

      const result = await service.findById('comp-001');

      expect(result.id).toBe('comp-001');
      expect(result.ruc).toBe('20000000001');
      // Encrypted SOL fields should be stripped
      expect(result).not.toHaveProperty('solUser');
      expect(result).not.toHaveProperty('solIv');
      expect(result).not.toHaveProperty('solTag');
      expect(result).toHaveProperty('hasSolCredentials');
    });

    it('should throw NotFoundException when the company does not exist', async () => {
      mocks.prisma.client.company.findUnique.mockResolvedValue(null);

      await expect(service.findById('comp-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
