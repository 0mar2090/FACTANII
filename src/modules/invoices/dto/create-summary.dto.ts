import {
  IsString,
  IsArray,
  ValidateNested,
  IsIn,
  IsNumber,
  IsOptional,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for a single line in a Resumen Diario.
 */
export class SummaryLineDto {
  /** Tipo de documento: 03 (Boleta), 07 (NC), 08 (ND) */
  @IsString()
  @IsIn(['03', '07', '08'])
  tipoDoc!: string;

  @IsString()
  serie!: string;

  @IsNumber()
  @Min(1)
  correlativo!: number;

  /** Tipo doc identidad del cliente (Cat 06) */
  @IsString()
  clienteTipoDoc!: string;

  @IsString()
  clienteNumDoc!: string;

  /** Estado: 1=Adicionar, 2=Modificar, 3=Anular */
  @IsString()
  @IsIn(['1', '2', '3'])
  estado!: '1' | '2' | '3';

  @IsNumber()
  @Min(0)
  totalVenta!: number;

  @IsNumber()
  @Min(0)
  opGravadas!: number;

  @IsNumber()
  @Min(0)
  opExoneradas!: number;

  @IsNumber()
  @Min(0)
  opInafectas!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  opGratuitas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otrosCargos?: number;

  @IsNumber()
  @Min(0)
  igv!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  isc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  icbper?: number;

  /** Para NC/ND: tipo doc referencia */
  @IsOptional()
  @IsString()
  docRefTipo?: string;

  @IsOptional()
  @IsString()
  docRefSerie?: string;

  @IsOptional()
  @IsNumber()
  docRefCorrelativo?: number;
}

/**
 * DTO for creating a Resumen Diario (RC).
 *
 * POST /api/v1/invoices/resumen-diario
 */
export class CreateSummaryDto {
  /** Fecha de los documentos resumidos (YYYY-MM-DD) */
  @IsString()
  fechaReferencia!: string;

  /** Fecha de generacion del resumen (YYYY-MM-DD). Defaults to today. */
  @IsOptional()
  @IsString()
  fechaEmision?: string;

  /** Moneda (defaults to PEN) */
  @IsOptional()
  @IsString()
  moneda?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SummaryLineDto)
  @ArrayMinSize(1)
  items!: SummaryLineDto[];
}
