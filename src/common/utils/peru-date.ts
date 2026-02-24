// ═══════════════════════════════════════════════════════════════════
// Peru Timezone Utility — SUNAT-compliant date operations (UTC-5)
// Uses native Intl.DateTimeFormat — no external timezone libraries.
// ═══════════════════════════════════════════════════════════════════

/** IANA timezone identifier for Peru (UTC-5, no DST) */
export const PERU_TZ = 'America/Lima';

/**
 * Returns a Date object representing the current instant, but whose
 * UTC fields are shifted to reflect Peru local time.
 *
 * Useful when you need a Date whose `.getUTCFullYear()`, `.getUTCMonth()`,
 * `.getUTCDate()` etc. return Peru-local values.
 */
export function peruNow(): Date {
  const now = new Date();
  // Format individual parts in Peru timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PERU_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(p => p.type === type)?.value ?? '0';

  return new Date(
    Date.UTC(
      Number(get('year')),
      Number(get('month')) - 1,
      Number(get('day')),
      Number(get('hour')),
      Number(get('minute')),
      Number(get('second')),
    ),
  );
}

/**
 * Returns today's date in Peru timezone as a YYYY-MM-DD string.
 *
 * This is the correct date to compare against `fechaEmision` values
 * for SUNAT sending-window validation.
 */
export function peruToday(): string {
  const now = new Date();
  // Intl with 'en-CA' locale produces YYYY-MM-DD format natively
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PERU_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Calculates the number of calendar days between a date string and a
 * reference date, both interpreted in Peru timezone.
 *
 * Returns a positive number if `dateStr` is in the past relative to
 * `referenceDate`, negative if in the future.
 *
 * @param dateStr - Date in YYYY-MM-DD format
 * @param referenceDate - Optional reference Date (defaults to current instant).
 *                        The reference is converted to Peru-local date before comparison.
 */
export function daysBetweenInPeru(dateStr: string, referenceDate?: Date): number {
  // Parse the date string as a pure calendar date (midnight UTC)
  const [year, month, day] = dateStr.split('-').map(Number);
  const targetMs = Date.UTC(year!, month! - 1, day!);

  // Get reference date in Peru timezone as midnight UTC
  const ref = referenceDate ?? new Date();
  const refDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: PERU_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ref);
  const [ry, rm, rd] = refDateStr.split('-').map(Number);
  const refMs = Date.UTC(ry!, rm! - 1, rd!);

  const MS_PER_DAY = 86_400_000;
  return Math.round((refMs - targetMs) / MS_PER_DAY);
}

/**
 * Validates that `fechaEmision` is within `maxDays` calendar days
 * from Peru's current date.
 *
 * Returns `true` if the date is valid (not in the future, and within the window).
 * Returns `false` if the date is in the future or exceeds the allowed window.
 *
 * @param fechaEmision - Emission date in YYYY-MM-DD format
 * @param maxDays - Maximum calendar days allowed (inclusive)
 */
export function isWithinMaxDays(fechaEmision: string, maxDays: number): boolean {
  const diff = daysBetweenInPeru(fechaEmision);
  // diff < 0 means future date, diff > maxDays means too old
  return diff >= 0 && diff <= maxDays;
}
