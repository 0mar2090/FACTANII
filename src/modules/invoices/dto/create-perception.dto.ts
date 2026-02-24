import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
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
  /** Tipo doc del comprobante relacionado (Cat 01): solo facturas (01) y boletas (03) */
  @IsString()
  @IsIn(['01', '03'])
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

  /** Tipo de cambio (solo si moneda != PEN) */
  @IsNumber()
  @IsOptional()
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
