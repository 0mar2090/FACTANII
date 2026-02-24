import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ConsultationsService } from './consultations.service.js';
import { SunatClientService } from '../sunat-client/sunat-client.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Consultas')
@Controller('consultas')
export class ConsultationsController {
  constructor(
    private readonly consultationsService: ConsultationsService,
    private readonly sunatClient: SunatClientService,
  ) {}

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

  @Get('validar-cpe')
  @Public()
  @ApiOperation({ summary: 'Validar CPE en SUNAT (producción)' })
  @ApiQuery({ name: 'ruc', required: true, description: 'RUC del emisor (11 dígitos)' })
  @ApiQuery({ name: 'tipoDoc', required: true, description: 'Tipo de documento: 01, 03, 07, 08' })
  @ApiQuery({ name: 'serie', required: true, description: 'Serie del documento (ej: F001)' })
  @ApiQuery({ name: 'correlativo', required: true, description: 'Correlativo del documento' })
  @ApiQuery({ name: 'fechaEmision', required: true, description: 'Fecha de emisión (YYYY-MM-DD)' })
  @ApiQuery({ name: 'monto', required: true, description: 'Monto total del documento' })
  @ApiResponse({ status: 200, description: 'Resultado de validación' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  async validarCpe(
    @Query('ruc') ruc: string,
    @Query('tipoDoc') tipoDoc: string,
    @Query('serie') serie: string,
    @Query('correlativo') correlativo: string,
    @Query('fechaEmision') fechaEmision: string,
    @Query('monto') monto: string,
  ) {
    if (!ruc || !tipoDoc || !serie || !correlativo || !fechaEmision || !monto) {
      throw new BadRequestException('All parameters are required: ruc, tipoDoc, serie, correlativo, fechaEmision, monto');
    }

    const result = await this.sunatClient.validateCpe(
      ruc,
      tipoDoc,
      serie,
      parseInt(correlativo, 10),
      fechaEmision,
      parseFloat(monto),
    );
    return { success: true, data: result };
  }
}
