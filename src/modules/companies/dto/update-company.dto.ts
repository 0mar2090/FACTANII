import { IsString, IsOptional, MaxLength, Length, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Empresa SAC' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  razonSocial?: string;

  @ApiPropertyOptional({ example: 'Mi Empresa' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombreComercial?: string;

  @ApiPropertyOptional({ example: 'Av. Arequipa 1234' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;

  @ApiPropertyOptional({ example: '150101' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Ubigeo must be exactly 6 digits' })
  ubigeo?: string;

  @ApiPropertyOptional({ example: 'Lima' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  departamento?: string;

  @ApiPropertyOptional({ example: 'Lima' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provincia?: string;

  @ApiPropertyOptional({ example: 'Lima' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  distrito?: string;

  @ApiPropertyOptional({ example: 'Urb. San Isidro' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  urbanizacion?: string;

  @ApiPropertyOptional({ example: 'F001' })
  @IsOptional()
  @IsString()
  @Matches(/^[FB]\d{3}$/, { message: 'Serie factura must match pattern F/B + 3 digits' })
  serieFactura?: string;

  @ApiPropertyOptional({ example: 'B001' })
  @IsOptional()
  @IsString()
  @Matches(/^[FB]\d{3}$/, { message: 'Serie boleta must match pattern F/B + 3 digits' })
  serieBoleta?: string;
}
