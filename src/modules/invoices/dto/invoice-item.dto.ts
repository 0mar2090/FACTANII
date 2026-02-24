import {
  IsString,
  IsNumber,
  IsOptional,
  IsIn,
  Min,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

export class InvoiceItemDto {
  @IsNumber()
  @Min(0.001)
  cantidad: number;

  @IsString()
  @IsOptional()
  unidadMedida?: string; // defaults to NIU

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  descripcion: string;

  @IsString()
  @IsOptional()
  codigo?: string;

  @IsString()
  @IsOptional()
  codigoSunat?: string;

  @IsNumber()
  @Min(0)
  valorUnitario: number; // price without IGV

  @IsString()
  @IsOptional()
  tipoAfectacion?: string; // Cat 07, defaults to "10" (gravado)

  @IsNumber()
  @IsOptional()
  @Min(0)
  isc?: number;

  /** Sistema de cálculo ISC: '01' al valor, '02' específico, '03' al precio de venta al público */
  @IsString()
  @IsOptional()
  @IsIn(['01', '02', '03'])
  tipoSistemaISC?: string;

  /** Tasa ISC para sistemas 01 y 03 (e.g. 0.30 para 30%) */
  @IsNumber()
  @IsOptional()
  @Min(0)
  tasaISC?: number;

  /** Monto fijo ISC por unidad para sistema 02 */
  @IsNumber()
  @IsOptional()
  @Min(0)
  montoFijoISC?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  descuento?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  cantidadBolsasPlastico?: number; // for ICBPER
}
