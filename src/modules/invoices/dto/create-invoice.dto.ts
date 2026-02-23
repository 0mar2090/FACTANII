import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  IsNumber,
  ArrayMinSize,
  MaxLength,
  IsIn,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceItemDto } from './invoice-item.dto.js';

export class PaymentInstallmentDto {
  @IsNumber()
  monto: number;

  @IsString()
  @IsOptional()
  moneda?: string;

  @IsDateString()
  fechaPago: string;
}

export class CreateInvoiceDto {
  /** Tipo de documento: "01" = Factura, "03" = Boleta (set automatically by endpoint) */
  @IsString()
  @IsIn(['01', '03'])
  @IsOptional()
  tipoDoc: string;

  /** Tipo de operacion Cat 51 (default "0101") */
  @IsString()
  @IsOptional()
  tipoOperacion?: string;

  /** Fecha de emisión YYYY-MM-DD */
  @IsDateString()
  fechaEmision: string;

  /** Fecha de vencimiento YYYY-MM-DD */
  @IsDateString()
  @IsOptional()
  fechaVencimiento?: string;

  /** Moneda ISO 4217 (default "PEN") */
  @IsString()
  @IsOptional()
  moneda?: string;

  // --- Client ---

  /** Tipo doc identidad del cliente (Cat 06) */
  @IsString()
  @IsIn(['0', '1', '4', '6', '7', '-'])
  clienteTipoDoc: string;

  /** Número de documento del cliente */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  clienteNumDoc: string;

  /** Nombre o razón social del cliente */
  @IsString()
  @IsNotEmpty()
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

  // --- Payment ---

  /** Forma de pago: "Contado" o "Credito" */
  @IsString()
  @IsOptional()
  @IsIn(['Contado', 'Credito'])
  formaPago?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PaymentInstallmentDto)
  cuotas?: PaymentInstallmentDto[];

  // --- Optional overrides ---

  @IsNumber()
  @IsOptional()
  descuentoGlobal?: number;

  @IsNumber()
  @IsOptional()
  otrosCargos?: number;
}
