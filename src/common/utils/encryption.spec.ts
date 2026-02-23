import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt, encryptBuffer, decryptBuffer } from './encryption.js';

const TEST_KEY = 'a'.repeat(64); // 32 bytes hex

describe('encryption', () => {
  let originalKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  describe('encrypt / decrypt (string)', () => {
    it('encrypts and decrypts a simple string', () => {
      const plaintext = 'Hello SUNAT';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('returns different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'deterministic?';
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a.ciphertext).not.toBe(b.ciphertext);
      expect(a.iv).not.toBe(b.iv);
    });

    it('encrypted result has expected shape', () => {
      const result = encrypt('test');
      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(typeof result.ciphertext).toBe('string');
      // IV = 12 bytes = 24 hex chars
      expect(result.iv).toHaveLength(24);
      // AuthTag = 16 bytes = 32 hex chars
      expect(result.authTag).toHaveLength(32);
    });

    it('handles empty string', () => {
      const encrypted = encrypt('');
      expect(decrypt(encrypted)).toBe('');
    });

    it('handles unicode / special characters', () => {
      const plaintext = 'Facturación electrónica — SUNAT 🇵🇪';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('fails to decrypt with tampered ciphertext', () => {
      const encrypted = encrypt('secret');
      encrypted.ciphertext = 'AAAA' + encrypted.ciphertext.slice(4);
      expect(() => decrypt(encrypted)).toThrow();
    });

    it('fails to decrypt with tampered authTag', () => {
      const encrypted = encrypt('secret');
      encrypted.authTag = '00'.repeat(16);
      expect(() => decrypt(encrypted)).toThrow();
    });
  });

  describe('encryptBuffer / decryptBuffer', () => {
    it('encrypts and decrypts a buffer', () => {
      const original = Buffer.from('PFX certificate data here');
      const { ciphertext, iv, authTag } = encryptBuffer(original);
      const decrypted = decryptBuffer(ciphertext, iv, authTag);
      expect(Buffer.compare(decrypted, original)).toBe(0);
    });

    it('handles binary data (non-UTF8)', () => {
      const original = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01, 0xfe]);
      const { ciphertext, iv, authTag } = encryptBuffer(original);
      const decrypted = decryptBuffer(ciphertext, iv, authTag);
      expect(Buffer.compare(decrypted, original)).toBe(0);
    });

    it('handles empty buffer', () => {
      const original = Buffer.alloc(0);
      const { ciphertext, iv, authTag } = encryptBuffer(original);
      const decrypted = decryptBuffer(ciphertext, iv, authTag);
      expect(decrypted).toHaveLength(0);
    });
  });

  describe('missing ENCRYPTION_KEY', () => {
    it('throws when ENCRYPTION_KEY is not set', () => {
      const saved = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      try {
        expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY');
      } finally {
        process.env.ENCRYPTION_KEY = saved;
      }
    });

    it('throws when ENCRYPTION_KEY is wrong length', () => {
      const saved = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'tooshort';
      try {
        expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY');
      } finally {
        process.env.ENCRYPTION_KEY = saved;
      }
    });
  });
});
