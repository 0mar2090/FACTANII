/**
 * Validación de RUC peruano (módulo 11)
 * El RUC tiene 11 dígitos. Los dos primeros definen el tipo:
 * 10 = Persona Natural, 20 = Persona Jurídica, 15/17 = Gobierno, etc.
 */

const VALID_PREFIXES = ['10', '15', '16', '17', '20'];
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Valida si un RUC peruano es válido usando el algoritmo de módulo 11
 */
export function isValidRuc(ruc: string): boolean {
  if (!ruc || ruc.length !== 11 || !/^\d{11}$/.test(ruc)) {
    return false;
  }

  const prefix = ruc.substring(0, 2);
  if (!VALID_PREFIXES.includes(prefix)) {
    return false;
  }

  const digits = ruc.split('').map(Number);
  let sum = 0;

  for (let i = 0; i < 10; i++) {
    sum += digits[i] * WEIGHTS[i];
  }

  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;

  return digits[10] === checkDigit;
}

/**
 * Valida si un DNI peruano tiene formato válido (8 dígitos)
 */
export function isValidDni(dni: string): boolean {
  return /^\d{8}$/.test(dni);
}

/**
 * Determina si un RUC es persona natural (10) o jurídica (20)
 */
export function getRucType(ruc: string): 'natural' | 'juridica' | 'gobierno' | 'unknown' {
  if (!isValidRuc(ruc)) return 'unknown';
  const prefix = ruc.substring(0, 2);
  if (prefix === '10') return 'natural';
  if (prefix === '20') return 'juridica';
  if (['15', '16', '17'].includes(prefix)) return 'gobierno';
  return 'unknown';
}
