import { describe, it, expect } from 'vitest';
import {
  getDetraccionRate,
  calculateDetraccionAmount,
  isDetraccionRequired,
} from '../tax-calculator.js';

describe('Detracción helpers', () => {
  describe('getDetraccionRate', () => {
    it('returns official rate for Anexo III services (12%)', () => {
      expect(getDetraccionRate('037')).toBe(0.12);
      expect(getDetraccionRate('012')).toBe(0.12);
    });

    it('returns official rate for Anexo II goods (4%)', () => {
      expect(getDetraccionRate('004')).toBe(0.04);
      expect(getDetraccionRate('027')).toBe(0.04);
    });

    it('returns official rate for Anexo I (10%)', () => {
      expect(getDetraccionRate('001')).toBe(0.10);
    });

    it('returns undefined for unknown code', () => {
      expect(getDetraccionRate('999')).toBeUndefined();
    });
  });

  describe('calculateDetraccionAmount', () => {
    it('calculates detracción for S/1000 service at 12%', () => {
      expect(calculateDetraccionAmount('037', 1000)).toBe(120);
    });

    it('calculates detracción for S/5000 resource at 4%', () => {
      expect(calculateDetraccionAmount('004', 5000)).toBe(200);
    });

    it('rounds to 2 decimals', () => {
      expect(calculateDetraccionAmount('037', 333.33)).toBe(40);
    });

    it('returns 0 for unknown code', () => {
      expect(calculateDetraccionAmount('999', 1000)).toBe(0);
    });
  });

  describe('isDetraccionRequired', () => {
    it('returns true when totalVenta >= 700 for services', () => {
      expect(isDetraccionRequired(700, '037')).toBe(true);
      expect(isDetraccionRequired(1000, '012')).toBe(true);
    });

    it('returns false when totalVenta < 700 for services', () => {
      expect(isDetraccionRequired(699.99, '037')).toBe(false);
    });

    it('returns true when totalVenta >= 400 for transport', () => {
      expect(isDetraccionRequired(400, '027')).toBe(true);
    });

    it('returns false when totalVenta < 400 for transport', () => {
      expect(isDetraccionRequired(399, '027')).toBe(false);
    });
  });
});
