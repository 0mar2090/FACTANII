import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  IsNumber,
  IsInt,
  ArrayMinSize,
  MaxLength,
  Min,
  IsIn,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GuideAddressDto {
  /** Ubigeo (6 dígitos) */
  @IsString()
  @MaxLength(6)
  ubigeo: string;

  /** Dirección completa */
  @IsString()
  @MaxLength(500)
  direccion: string;
}

export class GuideTransportistaDto {
  /** Tipo doc identidad (Cat 06) */
  @IsString()
  tipoDoc: string;

  /** Número de documento */
  @IsString()
  @MaxLength(20)
  numDoc: string;

  /** Razón social */
  @IsString()
  @MaxLength(300)
  nombre: string;

  /** Registro MTC */
  @IsString()
  @IsOptional()
  registroMTC?: string;
}

export class GuideConductorDto {
  /** Tipo doc identidad (Cat 06) */
  @IsString()
  tipoDoc: string;

  /** Número de documento */
  @IsString()
  @MaxLength(20)
  numDoc: string;

  /** Nombres (SUNAT: cbc:FirstName) */
  @IsString()
  @MaxLength(200)
  nombres: string;

  /** Apellidos (SUNAT: cbc:FamilyName) */
  @IsString()
  @MaxLength(200)
  apellidos: string;

  /** Número de licencia de conducir (requerido por SUNAT para transporte privado) */
  @IsString()
  @MaxLength(20)
  licencia: string;
}

export class GuideVehiculoDto {
  /** Placa del vehículo */
  @IsString()
  @MaxLength(10)
  placa: string;

  /** Placa del semirremolque (opcional) */
  @IsString()
  @IsOptional()
  @MaxLength(10)
  placaSecundaria?: string;
}

export class GuideItemDto {
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
}

export class GuideDocReferenciaDto {
  /** Tipo de documento referenciado ('01' factura, '03' boleta) */
  @IsString()
  tipoDoc: string;

  /** Serie del documento */
  @IsString()
  serieDoc: string;

  /** Correlativo del documento */
  @IsInt()
  @Min(1)
  correlativoDoc: number;
}

export class CreateGuideDto {
  /** Fecha de emisión YYYY-MM-DD */
  @IsDateString()
  fechaEmision: string;

  /** Fecha de inicio de traslado YYYY-MM-DD */
  @IsDateString()
  fechaTraslado: string;

  /** Motivo de traslado (Cat 20) */
  @IsString()
  motivoTraslado: string;

  /** Descripción del motivo (opcional) */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  descripcionMotivo?: string;

  /** Documento referenciado (requerido cuando motivoTraslado='01' Venta) */
  @ValidateNested()
  @Type(() => GuideDocReferenciaDto)
  @IsOptional()
  docReferencia?: GuideDocReferenciaDto;

  /** Modalidad de transporte (Cat 18): '01' público, '02' privado */
  @IsString()
  @IsIn(['01', '02'])
  modalidadTransporte: string;

  /** Peso bruto total en KG */
  @IsNumber()
  @Min(0.001)
  pesoTotal: number;

  /** Número de bultos */
  @IsInt()
  @IsOptional()
  @Min(1)
  numeroBultos?: number;

  // --- Destinatario ---

  /** Tipo doc identidad del destinatario */
  @IsString()
  destinatarioTipoDoc: string;

  /** Número de documento del destinatario */
  @IsString()
  @MaxLength(20)
  destinatarioNumDoc: string;

  /** Nombre o razón social del destinatario */
  @IsString()
  @MaxLength(300)
  destinatarioNombre: string;

  // --- Addresses ---

  @IsObject()
  @ValidateNested()
  @Type(() => GuideAddressDto)
  puntoPartida: GuideAddressDto;

  @IsObject()
  @ValidateNested()
  @Type(() => GuideAddressDto)
  puntoLlegada: GuideAddressDto;

  // --- Transport ---

  @IsOptional()
  @ValidateNested()
  @Type(() => GuideTransportistaDto)
  transportista?: GuideTransportistaDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GuideConductorDto)
  conductor?: GuideConductorDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GuideVehiculoDto)
  vehiculo?: GuideVehiculoDto;

  // --- Items ---

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GuideItemDto)
  items: GuideItemDto[];
}
