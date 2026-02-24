import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  ValidateIf,
  IsDateString,
  IsNumber,
  ArrayMinSize,
  MaxLength,
  IsIn,
  IsNotEmpty,
  IsEmail,
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

  @IsEmail()
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

  /** Cuotas requeridas cuando formaPago es "Credito" */
  @ValidateIf((o) => o.formaPago === 'Credito')
  @IsArray()
  @ArrayMinSize(1, { message: 'cuotas is required when formaPago is Credito' })
  @ValidateNested({ each: true })
  @Type(() => PaymentInstallmentDto)
  cuotas?: PaymentInstallmentDto[];

  // --- Detracción (SPOT) ---

  @IsString()
  @IsOptional()
  codigoDetraccion?: string;

  @IsNumber()
  @IsOptional()
  porcentajeDetraccion?: number;

  @IsNumber()
  @IsOptional()
  montoDetraccion?: number;

  @IsString()
  @IsOptional()
  cuentaDetraccion?: string;

  /** Medio de pago para detracción — Catálogo 59 (default: '001' depósito en cuenta) */
  @IsString()
  @IsOptional()
  medioPagoDetraccion?: string;

  // --- Anticipos ---

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AnticipoItemDto)
  anticipos?: AnticipoItemDto[];

  // --- Documentos relacionados ---

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DocRelacionadoDto)
  documentosRelacionados?: DocRelacionadoDto[];

  // --- Contingencia ---

  /** Referencia al documento físico emitido en contingencia (para tipoOperacion '0401') */
  @IsString()
  @IsOptional()
  @MaxLength(30)
  orderReferenceId?: string;

  // --- Optional overrides ---

  @IsNumber()
  @IsOptional()
  descuentoGlobal?: number;

  @IsNumber()
  @IsOptional()
  otrosCargos?: number;
}

export class AnticipoItemDto {
  @IsString()
  @IsIn(['02', '03'])
  tipoDoc!: string;

  @IsString()
  serie: string;

  @IsNumber()
  correlativo: number;

  @IsString()
  @IsOptional()
  moneda?: string;

  @IsNumber()
  monto: number;

  @IsDateString()
  fechaPago: string;
}

export class DocRelacionadoDto {
  @IsString()
  tipoDoc: string;

  @IsString()
  numero: string;
}
