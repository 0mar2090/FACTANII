import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  ValidateNested,
  IsDateString,
  IsInt,
  ArrayMinSize,
  MaxLength,
  Min,
  IsIn,
  IsNotEmpty,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceItemDto } from './invoice-item.dto.js';

export class CreateCreditNoteDto {
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
  @IsIn(['01', '03'])
  docRefTipo: string;

  /** Serie del documento de referencia */
  @IsString()
  @IsNotEmpty()
  docRefSerie: string;

  /** Correlativo del documento de referencia */
  @IsInt()
  @Min(1)
  docRefCorrelativo: number;

  /** Motivo de la nota de crédito (Cat 09) */
  @IsString()
  motivoNota: string;

  /** Descripción del motivo */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivoDescripcion: string;

  /** Monto total del documento original (for motivo 13 balance validation) */
  @IsNumber()
  @IsOptional()
  @Min(0)
  montoOriginal?: number;

  // --- Client ---

  @IsString()
  @IsIn(['0', '1', '4', '6', '7', '-'])
  clienteTipoDoc: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  clienteNumDoc: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  clienteNombre: string;

  @IsString()
  @IsOptional()
  clienteDireccion?: string;

  @IsEmail()
  @IsOptional()
  clienteEmail?: string;

  // --- Items ---

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  /** Override IGV rate (e.g. 0.105 for MYPE Ley 32357). Defaults to 0.18. */
  @IsNumber()
  @IsOptional()
  tasaIGV?: number;
}
