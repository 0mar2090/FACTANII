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

export class RetentionItemDto {
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

  /** Fecha de pago */
  @IsDateString()
  fechaPago: string;

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

export class CreateRetentionDto {
  /** Fecha de emisión YYYY-MM-DD */
  @IsDateString()
  fechaEmision: string;

  /** Régimen de retención: '01' (3%) o '02' (6%) */
  @IsString()
  @IsIn(['01', '02'])
  regimenRetencion: string;

  // --- Proveedor (sujeto retenido) ---

  /** Tipo doc identidad del proveedor (Cat 06) */
  @IsString()
  proveedorTipoDoc: string;

  /** Número de documento del proveedor */
  @IsString()
  @MaxLength(20)
  proveedorNumDoc: string;

  /** Nombre o razón social del proveedor */
  @IsString()
  @MaxLength(300)
  proveedorNombre: string;

  @IsString()
  @IsOptional()
  proveedorDireccion?: string;

  // --- Items ---

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RetentionItemDto)
  items: RetentionItemDto[];
}
