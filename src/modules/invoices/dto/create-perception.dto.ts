import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  ValidateIf,
  IsDateString,
  IsInt,
  IsNumber,
  ArrayMinSize,
  MaxLength,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PerceptionItemDto {
  /** Tipo doc del comprobante relacionado (Cat 01): facturas, boletas, NC, ND */
  @IsString()
  @IsIn(['01', '03', '07', '08', '12', '13'])
  tipoDocRelacionado: string;

  /** Serie del comprobante relacionado */
  @IsString()
  serieDoc: string;

  /** Correlativo del comprobante relacionado */
  @IsInt()
  @Min(1)
  correlativoDoc: number;

  /** Fecha de emisión del comprobante relacionado */
  @IsDateString()
  fechaDoc: string;

  /** Importe total del comprobante */
  @IsNumber()
  @Min(0)
  importeTotal: number;

  /** Fecha de cobro */
  @IsDateString()
  fechaCobro: string;

  /** Moneda del comprobante */
  @IsString()
  @IsOptional()
  moneda?: string;

  /** Tipo de cambio — requerido si moneda != PEN */
  @ValidateIf((o) => o.moneda && o.moneda !== 'PEN')
  @IsNumber({}, { message: 'tipoCambio is required when moneda is not PEN' })
  @Min(0.001)
  tipoCambio?: number;
}

export class CreatePerceptionDto {
  /** Fecha de emisión YYYY-MM-DD */
  @IsDateString()
  fechaEmision: string;

  /** Régimen de percepción: '01' (2%), '02' (1%), '03' (0.5%) */
  @IsString()
  @IsIn(['01', '02', '03'])
  regimenPercepcion: string;

  // --- Cliente (sujeto percibido) ---

  /** Tipo doc identidad del cliente (Cat 06) */
  @IsString()
  clienteTipoDoc: string;

  /** Número de documento del cliente */
  @IsString()
  @MaxLength(20)
  clienteNumDoc: string;

  /** Nombre o razón social del cliente */
  @IsString()
  @MaxLength(300)
  clienteNombre: string;

  @IsString()
  @IsOptional()
  clienteDireccion?: string;

  // --- Items ---

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PerceptionItemDto)
  items: PerceptionItemDto[];
}
