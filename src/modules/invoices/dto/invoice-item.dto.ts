import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';

export class InvoiceItemDto {
  @IsNumber()
  @Min(0.001)
  cantidad: number;

  @IsString()
  @IsOptional()
  unidadMedida?: string; // defaults to NIU

  @IsString()
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

  @IsNumber()
  @IsOptional()
  @Min(0)
  descuento?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  cantidadBolsasPlastico?: number; // for ICBPER
}
