import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ConsultationsService } from './consultations.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Consultas')
@Controller('consultas')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get('ruc/:ruc')
  @Public()
  @ApiOperation({ summary: 'Consultar información de RUC en SUNAT' })
  @ApiParam({ name: 'ruc', description: 'Número de RUC (11 dígitos)', example: '20100039207' })
  @ApiResponse({ status: 200, description: 'Información del RUC' })
  @ApiResponse({ status: 400, description: 'RUC inválido' })
  async consultRuc(@Param('ruc') ruc: string) {
    const data = await this.consultationsService.consultRuc(ruc);
    return { success: true, data };
  }

  @Get('dni/:dni')
  @Public()
  @ApiOperation({ summary: 'Consultar información de DNI en RENIEC' })
  @ApiParam({ name: 'dni', description: 'Número de DNI (8 dígitos)', example: '12345678' })
  @ApiResponse({ status: 200, description: 'Información del DNI' })
  @ApiResponse({ status: 400, description: 'DNI inválido' })
  async consultDni(@Param('dni') dni: string) {
    const data = await this.consultationsService.consultDni(dni);
    return { success: true, data };
  }

  @Get('tipo-cambio')
  @Public()
  @ApiOperation({ summary: 'Consultar tipo de cambio SUNAT (USD/PEN)' })
  @ApiQuery({
    name: 'fecha',
    required: false,
    description: 'Fecha en formato YYYY-MM-DD (por defecto: hoy)',
    example: '2026-02-22',
  })
  @ApiResponse({ status: 200, description: 'Tipo de cambio del día' })
  @ApiResponse({ status: 400, description: 'Formato de fecha inválido' })
  async getTipoCambio(@Query('fecha') fecha?: string) {
    const data = await this.consultationsService.getTipoCambio(fecha);
    return { success: true, data };
  }
}
