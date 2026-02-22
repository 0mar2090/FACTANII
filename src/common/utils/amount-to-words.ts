/**
 * Convierte un monto numérico a letras en español
 * Requerido por SUNAT: Leyenda 1000 "MONTO EN LETRAS"
 * Ejemplo: 1500.50 → "MIL QUINIENTOS CON 50/100 SOLES"
 */

const UNIDADES = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO',
  'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
  'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
  'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO',
  'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
];

const DECENAS = [
  '', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA',
  'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA',
];

const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
];

const MONEDAS: Record<string, { singular: string; plural: string }> = {
  PEN: { singular: 'SOL', plural: 'SOLES' },
  USD: { singular: 'DOLAR AMERICANO', plural: 'DOLARES AMERICANOS' },
  EUR: { singular: 'EURO', plural: 'EUROS' },
};

function convertGroup(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';

  let result = '';

  if (n >= 100) {
    result += CENTENAS[Math.floor(n / 100)];
    n %= 100;
    if (n > 0) result += ' ';
  }

  if (n < 30) {
    result += UNIDADES[n];
  } else {
    result += DECENAS[Math.floor(n / 10)];
    const unit = n % 10;
    if (unit > 0) result += ' Y ' + UNIDADES[unit];
  }

  return result;
}

export function amountToWords(amount: number, currencyCode = 'PEN'): string {
  if (amount < 0) amount = Math.abs(amount);

  const intPart = Math.floor(amount);
  const decPart = Math.round((amount - intPart) * 100);

  if (intPart === 0) {
    const moneda = MONEDAS[currencyCode] ?? MONEDAS.PEN;
    return `CERO CON ${decPart.toString().padStart(2, '0')}/100 ${moneda.plural}`;
  }

  let words = '';

  // Millones
  const millions = Math.floor(intPart / 1_000_000);
  if (millions > 0) {
    if (millions === 1) {
      words += 'UN MILLON';
    } else {
      words += convertGroup(millions) + ' MILLONES';
    }
  }

  // Miles
  const thousands = Math.floor((intPart % 1_000_000) / 1000);
  if (thousands > 0) {
    if (words) words += ' ';
    if (thousands === 1) {
      words += 'MIL';
    } else {
      words += convertGroup(thousands) + ' MIL';
    }
  }

  // Unidades
  const units = intPart % 1000;
  if (units > 0) {
    if (words) words += ' ';
    words += convertGroup(units);
  }

  const moneda = MONEDAS[currencyCode] ?? MONEDAS.PEN;
  const monedaStr = intPart === 1 ? moneda.singular : moneda.plural;

  return `${words} CON ${decPart.toString().padStart(2, '0')}/100 ${monedaStr}`;
}
