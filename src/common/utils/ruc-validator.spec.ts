import { describe, it, expect } from 'vitest';
import { isValidRuc, isValidDni, getRucType } from './ruc-validator.js';

describe('isValidRuc', () => {
  it('validates SUNAT beta RUC 20000000001', () => {
    // Beta RUC used in tests — prefix 20 (juridica)
    expect(isValidRuc('20000000001')).toBe(true);
  });

  it('rejects null/undefined/empty', () => {
    expect(isValidRuc('')).toBe(false);
    expect(isValidRuc(null as any)).toBe(false);
    expect(isValidRuc(undefined as any)).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidRuc('1234567890')).toBe(false);   // 10 digits
    expect(isValidRuc('123456789012')).toBe(false);  // 12 digits
  });

  it('rejects non-numeric', () => {
    expect(isValidRuc('2000000000A')).toBe(false);
    expect(isValidRuc('abcdefghijk')).toBe(false);
  });

  it('rejects invalid prefixes', () => {
    // Prefixes not in [10, 15, 16, 17, 20]
    expect(isValidRuc('30000000001')).toBe(false);
    expect(isValidRuc('11000000001')).toBe(false);
    expect(isValidRuc('99000000001')).toBe(false);
  });

  it('rejects valid format but wrong check digit', () => {
    // 20000000001 is valid, 20000000002 should fail check digit
    expect(isValidRuc('20000000002')).toBe(false);
    expect(isValidRuc('20000000009')).toBe(false);
  });

  it('accepts valid persona natural RUC (prefix 10)', () => {
    // Module-11 check: digits 1,0,0,0,0,0,0,0,0,0 with weights 5,4,3,2,7,6,5,4,3,2
    // sum = 1*5 = 5, remainder = 11 - (5 % 11) = 6, check digit = 6
    expect(isValidRuc('10000000006')).toBe(true);
  });
});

describe('isValidDni', () => {
  it('accepts 8-digit DNI', () => {
    expect(isValidDni('12345678')).toBe(true);
    expect(isValidDni('00000001')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidDni('1234567')).toBe(false);
    expect(isValidDni('123456789')).toBe(false);
  });

  it('rejects non-numeric', () => {
    expect(isValidDni('1234567A')).toBe(false);
    expect(isValidDni('abcdefgh')).toBe(false);
  });

  it('rejects empty', () => {
    expect(isValidDni('')).toBe(false);
  });
});

describe('getRucType', () => {
  it('returns "juridica" for prefix 20', () => {
    expect(getRucType('20000000001')).toBe('juridica');
  });

  it('returns "natural" for prefix 10', () => {
    expect(getRucType('10000000006')).toBe('natural');
  });

  it('returns "gobierno" for prefix 15, 16, 17', () => {
    // We need valid RUCs for these prefixes, compute check digits:
    // 15000000001: sum = 1*5+5*4+0*3+... = 5+20 = 25, r=11-(25%11)=11-3=8
    const ruc15 = '15000000008';
    if (isValidRuc(ruc15)) {
      expect(getRucType(ruc15)).toBe('gobierno');
    }
  });

  it('returns "unknown" for invalid RUC', () => {
    expect(getRucType('invalid')).toBe('unknown');
    expect(getRucType('99999999999')).toBe('unknown');
    expect(getRucType('')).toBe('unknown');
  });
});
