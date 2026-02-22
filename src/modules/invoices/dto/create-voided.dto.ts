import {
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for a single line in a Comunicación de Baja.
 */
export class VoidedLineDto {
  /** Tipo de documento: 01, 03, 07, 08 */
  @IsString()
  tipoDoc!: string;

  @IsString()
  serie!: string;

  @IsNumber()
  @Min(1)
  correlativo!: number;

  /** Razón de la baja */
  @IsString()
  motivo!: string;
}

/**
 * DTO for creating a Comunicación de Baja (RA).
 *
 * POST /api/v1/invoices/comunicacion-baja
 */
export class CreateVoidedDto {
  /** Fecha de los documentos a dar de baja (YYYY-MM-DD) */
  @IsString()
  fechaReferencia!: string;

  /** Fecha de generacion de la baja (YYYY-MM-DD). Defaults to today. */
  @IsOptional()
  @IsString()
  fechaEmision?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VoidedLineDto)
  @ArrayMinSize(1)
  items!: VoidedLineDto[];
}
