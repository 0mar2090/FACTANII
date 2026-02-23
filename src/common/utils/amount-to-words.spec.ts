import { describe, it, expect } from 'vitest';
import { amountToWords } from './amount-to-words.js';

describe('amountToWords', () => {
  describe('basic numbers', () => {
    it('converts zero', () => {
      expect(amountToWords(0)).toBe('CERO CON 00/100 SOLES');
    });

    it('converts one', () => {
      expect(amountToWords(1)).toBe('UNO CON 00/100 SOL');
    });

    it('converts units (2-9)', () => {
      expect(amountToWords(5)).toBe('CINCO CON 00/100 SOLES');
      expect(amountToWords(9)).toBe('NUEVE CON 00/100 SOLES');
    });

    it('converts teens (10-19)', () => {
      expect(amountToWords(10)).toBe('DIEZ CON 00/100 SOLES');
      expect(amountToWords(15)).toBe('QUINCE CON 00/100 SOLES');
      expect(amountToWords(19)).toBe('DIECINUEVE CON 00/100 SOLES');
    });

    it('converts twenties (20-29)', () => {
      expect(amountToWords(20)).toBe('VEINTE CON 00/100 SOLES');
      expect(amountToWords(25)).toBe('VEINTICINCO CON 00/100 SOLES');
    });

    it('converts tens (30-99)', () => {
      expect(amountToWords(30)).toBe('TREINTA CON 00/100 SOLES');
      expect(amountToWords(42)).toBe('CUARENTA Y DOS CON 00/100 SOLES');
      expect(amountToWords(99)).toBe('NOVENTA Y NUEVE CON 00/100 SOLES');
    });
  });

  describe('hundreds', () => {
    it('converts 100 as CIEN', () => {
      expect(amountToWords(100)).toBe('CIEN CON 00/100 SOLES');
    });

    it('converts 101-199 as CIENTO', () => {
      expect(amountToWords(101)).toBe('CIENTO UNO CON 00/100 SOLES');
      expect(amountToWords(150)).toBe('CIENTO CINCUENTA CON 00/100 SOLES');
    });

    it('converts other hundreds', () => {
      expect(amountToWords(200)).toBe('DOSCIENTOS CON 00/100 SOLES');
      expect(amountToWords(500)).toBe('QUINIENTOS CON 00/100 SOLES');
      expect(amountToWords(999)).toBe('NOVECIENTOS NOVENTA Y NUEVE CON 00/100 SOLES');
    });
  });

  describe('thousands', () => {
    it('converts 1000 as MIL', () => {
      expect(amountToWords(1000)).toBe('MIL CON 00/100 SOLES');
    });

    it('converts 1500.50 (common SUNAT example)', () => {
      expect(amountToWords(1500.50)).toBe('MIL QUINIENTOS CON 50/100 SOLES');
    });

    it('converts multiples of thousand', () => {
      expect(amountToWords(2000)).toBe('DOS MIL CON 00/100 SOLES');
      expect(amountToWords(10000)).toBe('DIEZ MIL CON 00/100 SOLES');
      expect(amountToWords(100000)).toBe('CIEN MIL CON 00/100 SOLES');
    });
  });

  describe('millions', () => {
    it('converts 1 million', () => {
      expect(amountToWords(1000000)).toBe('UN MILLON CON 00/100 SOLES');
    });

    it('converts multiple millions', () => {
      expect(amountToWords(2000000)).toBe('DOS MILLONES CON 00/100 SOLES');
      expect(amountToWords(5000000)).toBe('CINCO MILLONES CON 00/100 SOLES');
    });

    it('converts mixed millions', () => {
      expect(amountToWords(1500000)).toBe('UN MILLON QUINIENTOS MIL CON 00/100 SOLES');
    });
  });

  describe('decimals', () => {
    it('formats decimal part as XX/100', () => {
      expect(amountToWords(10.50)).toBe('DIEZ CON 50/100 SOLES');
      expect(amountToWords(100.01)).toBe('CIEN CON 01/100 SOLES');
      expect(amountToWords(0.99)).toBe('CERO CON 99/100 SOLES');
    });

    it('handles fractional cents correctly', () => {
      // 10.505 → intPart=10, decPart=Math.round(0.505*100)=51
      expect(amountToWords(10.505)).toBe('DIEZ CON 51/100 SOLES');
      // 10.50 → exact
      expect(amountToWords(10.50)).toBe('DIEZ CON 50/100 SOLES');
    });
  });

  describe('currencies', () => {
    it('defaults to PEN (SOLES)', () => {
      expect(amountToWords(100)).toContain('SOLES');
    });

    it('uses singular for amount = 1 (SOL)', () => {
      expect(amountToWords(1, 'PEN')).toContain('SOL');
      expect(amountToWords(1, 'PEN')).not.toContain('SOLES');
    });

    it('supports USD', () => {
      expect(amountToWords(100, 'USD')).toContain('DOLARES AMERICANOS');
      expect(amountToWords(1, 'USD')).toContain('DOLAR AMERICANO');
    });

    it('supports EUR', () => {
      expect(amountToWords(50, 'EUR')).toContain('EUROS');
      expect(amountToWords(1, 'EUR')).toContain('EURO');
    });

    it('falls back to PEN for unknown currencies', () => {
      expect(amountToWords(100, 'GBP')).toContain('SOLES');
    });
  });

  describe('edge cases', () => {
    it('handles negative amounts as absolute value', () => {
      expect(amountToWords(-100)).toBe(amountToWords(100));
    });

    it('handles typical SUNAT invoice amounts', () => {
      // 118.00 (100 + 18% IGV)
      expect(amountToWords(118.00)).toBe('CIENTO DIECIOCHO CON 00/100 SOLES');
      // 23600.00 (20000 + 18% IGV)
      expect(amountToWords(23600.00)).toBe('VEINTITRES MIL SEISCIENTOS CON 00/100 SOLES');
    });
  });
});
