import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { isValidRuc, isValidDni } from '../../common/utils/ruc-validator.js';

export interface RucResult {
  ruc: string;
  razonSocial: string;
  estado: string;
  condicion: string;
  direccion: string;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

export interface DniResult {
  dni: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombreCompleto: string;
}

export interface TipoCambioResult {
  fecha: string;
  compra: number;
  venta: number;
  moneda: string;
}

const API_BASE_URL = 'https://api.apis.net.pe/v2';
const FETCH_TIMEOUT_MS = 10_000;

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  async consultRuc(ruc: string): Promise<RucResult> {
    if (!isValidRuc(ruc)) {
      throw new BadRequestException(
        `RUC inválido: debe tener 11 dígitos numéricos y pasar validación módulo 11`,
      );
    }

    const url = `${API_BASE_URL}/sunat/ruc?numero=${ruc}`;
    this.logger.log(`Consultando RUC ${ruc}`);

    try {
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        this.logger.warn(
          `API RUC respondió con status ${response.status} para RUC ${ruc}`,
        );
        throw new Error(`API respondió con status ${response.status}`);
      }

      const data = (await response.json()) as Record<string, any>;

      return {
        ruc: data.numeroDocumento ?? ruc,
        razonSocial: data.razonSocial ?? '',
        estado: data.estado ?? '',
        condicion: data.condicion ?? '',
        direccion: data.direccion ?? '',
        ubigeo: data.ubigeo ?? '',
        departamento: data.departamento ?? '',
        provincia: data.provincia ?? '',
        distrito: data.distrito ?? '',
      };
    } catch (error) {
      this.logger.error(
        `Error consultando RUC ${ruc}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      // Fallback: return minimal validated info
      return {
        ruc,
        razonSocial: '',
        estado: 'NO DISPONIBLE',
        condicion: 'NO DISPONIBLE',
        direccion: '',
        ubigeo: '',
        departamento: '',
        provincia: '',
        distrito: '',
      };
    }
  }

  async consultDni(dni: string): Promise<DniResult> {
    if (!isValidDni(dni)) {
      throw new BadRequestException(
        `DNI inválido: debe tener exactamente 8 dígitos numéricos`,
      );
    }

    const url = `${API_BASE_URL}/reniec/dni?numero=${dni}`;
    this.logger.log(`Consultando DNI ${dni}`);

    try {
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        this.logger.warn(
          `API DNI respondió con status ${response.status} para DNI ${dni}`,
        );
        throw new Error(`API respondió con status ${response.status}`);
      }

      const data = (await response.json()) as Record<string, any>;

      const nombres: string = data.nombres ?? '';
      const apellidoPaterno: string = data.apellidoPaterno ?? '';
      const apellidoMaterno: string = data.apellidoMaterno ?? '';

      return {
        dni: data.numeroDocumento ?? dni,
        nombres,
        apellidoPaterno,
        apellidoMaterno,
        nombreCompleto:
          data.nombreCompleto ??
          `${apellidoPaterno} ${apellidoMaterno} ${nombres}`.trim(),
      };
    } catch (error) {
      this.logger.error(
        `Error consultando DNI ${dni}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return {
        dni,
        nombres: '',
        apellidoPaterno: '',
        apellidoMaterno: '',
        nombreCompleto: '',
      };
    }
  }

  async getTipoCambio(fecha?: string): Promise<TipoCambioResult> {
    const targetDate = fecha ?? this.getTodayDateString();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      throw new BadRequestException(
        `Formato de fecha inválido: debe ser YYYY-MM-DD`,
      );
    }

    const url = `${API_BASE_URL}/sunat/tipo-cambio?fecha=${targetDate}`;
    this.logger.log(`Consultando tipo de cambio para fecha ${targetDate}`);

    try {
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        this.logger.warn(
          `API tipo de cambio respondió con status ${response.status} para fecha ${targetDate}`,
        );
        throw new Error(`API respondió con status ${response.status}`);
      }

      const data = (await response.json()) as Record<string, any>;

      return {
        fecha: data.fecha ?? targetDate,
        compra: Number(data.compra) || 0,
        venta: Number(data.venta) || 0,
        moneda: data.moneda ?? 'USD',
      };
    } catch (error) {
      this.logger.error(
        `Error consultando tipo de cambio para ${targetDate}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return {
        fecha: targetDate,
        compra: 0,
        venta: 0,
        moneda: 'USD',
      };
    }
  }

  /**
   * Wraps native fetch() with a 10-second abort timeout.
   */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Returns today's date as YYYY-MM-DD in Lima/Peru timezone.
   */
  private getTodayDateString(): string {
    const now = new Date();
    const peruDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    return peruDate; // en-CA returns YYYY-MM-DD format
  }
}
