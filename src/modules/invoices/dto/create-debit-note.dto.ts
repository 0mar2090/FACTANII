import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  IsInt,
  ArrayMinSize,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceItemDto } from './invoice-item.dto.js';

export class CreateDebitNoteDto {
  /** Fecha de emisión YYYY-MM-DD */
  @IsDateString()
  fechaEmision: string;

  /** Moneda ISO 4217 (default "PEN") */
  @IsString()
  @IsOptional()
  moneda?: string;

  // --- Referenced document ---

  /** Tipo del documento de referencia ("01" = factura, "03" = boleta) */
  @IsString()
  docRefTipo: string;

  /** Serie del documento de referencia */
  @IsString()
  docRefSerie: string;

  /** Correlativo del documento de referencia */
  @IsInt()
  @Min(1)
  docRefCorrelativo: number;

  /** Motivo de la nota de débito (Cat 10) */
  @IsString()
  motivoNota: string;

  /** Descripción del motivo */
  @IsString()
  @MaxLength(500)
  motivoDescripcion: string;

  // --- Client ---

  @IsString()
  clienteTipoDoc: string;

  @IsString()
  @MaxLength(20)
  clienteNumDoc: string;

  @IsString()
  @MaxLength(300)
  clienteNombre: string;

  @IsString()
  @IsOptional()
  clienteDireccion?: string;

  @IsString()
  @IsOptional()
  clienteEmail?: string;

  // --- Items ---

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];
}
