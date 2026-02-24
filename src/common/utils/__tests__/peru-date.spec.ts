import { describe, it, expect } from 'vitest';
import {
  PERU_TZ,
  peruNow,
  peruToday,
  daysBetweenInPeru,
  isWithinMaxDays,
} from '../peru-date.js';

describe('Peru timezone utilities', () => {
  describe('PERU_TZ', () => {
    it('is America/Lima', () => {
      expect(PERU_TZ).toBe('America/Lima');
    });
  });

  describe('peruNow', () => {
    it('returns a Date object', () => {
      const now = peruNow();
      expect(now).toBeInstanceOf(Date);
    });

    it('returns a reasonable date (not NaN)', () => {
      const now = peruNow();
      expect(Number.isNaN(now.getTime())).toBe(false);
    });
  });

  describe('peruToday', () => {
    it('returns a string in YYYY-MM-DD format', () => {
      const today = peruToday();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('year is reasonable (2024-2030)', () => {
      const today = peruToday();
      const year = Number(today.split('-')[0]);
      expect(year).toBeGreaterThanOrEqual(2024);
      expect(year).toBeLessThanOrEqual(2030);
    });

    it('month is between 01 and 12', () => {
      const today = peruToday();
      const month = Number(today.split('-')[1]);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    });

    it('day is between 01 and 31', () => {
      const today = peruToday();
      const day = Number(today.split('-')[2]);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(31);
    });
  });

  describe('daysBetweenInPeru', () => {
    it('returns 0 when date matches Peru today', () => {
      const today = peruToday();
      expect(daysBetweenInPeru(today)).toBe(0);
    });

    it('returns positive number for past dates', () => {
      // Use a fixed reference date to avoid flakiness
      const ref = new Date('2026-02-24T12:00:00Z');
      const result = daysBetweenInPeru('2026-02-21', ref);
      expect(result).toBe(3);
    });

    it('returns negative number for future dates', () => {
      const ref = new Date('2026-02-24T12:00:00Z');
      const result = daysBetweenInPeru('2026-02-27', ref);
      expect(result).toBe(-3);
    });

    it('calculates correctly across month boundaries', () => {
      const ref = new Date('2026-03-02T12:00:00Z');
      const result = daysBetweenInPeru('2026-02-27', ref);
      expect(result).toBe(3);
    });

    it('calculates correctly across year boundaries', () => {
      const ref = new Date('2026-01-02T12:00:00Z');
      const result = daysBetweenInPeru('2025-12-30', ref);
      expect(result).toBe(3);
    });

    it('returns 0 when dateStr equals reference date', () => {
      const ref = new Date('2026-06-15T15:30:00Z');
      // Peru is UTC-5, so 15:30 UTC = 10:30 Peru time, still June 15
      expect(daysBetweenInPeru('2026-06-15', ref)).toBe(0);
    });

    it('handles timezone edge: UTC midnight is still previous day in Peru', () => {
      // At 2026-02-25T03:00:00Z, Peru time is 2026-02-24T22:00:00 (still Feb 24)
      const ref = new Date('2026-02-25T03:00:00Z');
      expect(daysBetweenInPeru('2026-02-24', ref)).toBe(0);
    });

    it('handles timezone edge: UTC late night is next day only after 05:00 UTC', () => {
      // At 2026-02-25T06:00:00Z, Peru time is 2026-02-25T01:00:00 (now Feb 25)
      const ref = new Date('2026-02-25T06:00:00Z');
      expect(daysBetweenInPeru('2026-02-24', ref)).toBe(1);
    });
  });

  describe('isWithinMaxDays', () => {
    it('returns true for today', () => {
      const today = peruToday();
      expect(isWithinMaxDays(today, 3)).toBe(true);
    });

    it('returns true for a date within the window', () => {
      // Construct a date that is 2 days ago in Peru time
      const today = peruToday();
      const [y, m, d] = today.split('-').map(Number);
      const twoDaysAgo = new Date(Date.UTC(y!, m! - 1, d! - 2));
      const dateStr = twoDaysAgo.toISOString().split('T')[0]!;
      expect(isWithinMaxDays(dateStr, 3)).toBe(true);
    });

    it('returns true for a date exactly at the boundary', () => {
      const today = peruToday();
      const [y, m, d] = today.split('-').map(Number);
      const threeDaysAgo = new Date(Date.UTC(y!, m! - 1, d! - 3));
      const dateStr = threeDaysAgo.toISOString().split('T')[0]!;
      expect(isWithinMaxDays(dateStr, 3)).toBe(true);
    });

    it('returns false for a date beyond the window', () => {
      const today = peruToday();
      const [y, m, d] = today.split('-').map(Number);
      const fourDaysAgo = new Date(Date.UTC(y!, m! - 1, d! - 4));
      const dateStr = fourDaysAgo.toISOString().split('T')[0]!;
      expect(isWithinMaxDays(dateStr, 3)).toBe(false);
    });

    it('returns false for future dates', () => {
      const today = peruToday();
      const [y, m, d] = today.split('-').map(Number);
      const tomorrow = new Date(Date.UTC(y!, m! - 1, d! + 1));
      const dateStr = tomorrow.toISOString().split('T')[0]!;
      expect(isWithinMaxDays(dateStr, 3)).toBe(false);
    });

    it('works with 7-day window (boleta)', () => {
      const today = peruToday();
      const [y, m, d] = today.split('-').map(Number);
      const sixDaysAgo = new Date(Date.UTC(y!, m! - 1, d! - 6));
      const dateStr = sixDaysAgo.toISOString().split('T')[0]!;
      expect(isWithinMaxDays(dateStr, 7)).toBe(true);
    });

    it('works with 9-day window (retention/perception)', () => {
      const today = peruToday();
      const [y, m, d] = today.split('-').map(Number);
      const nineDaysAgo = new Date(Date.UTC(y!, m! - 1, d! - 9));
      const dateStr = nineDaysAgo.toISOString().split('T')[0]!;
      expect(isWithinMaxDays(dateStr, 9)).toBe(true);
    });
  });
});
