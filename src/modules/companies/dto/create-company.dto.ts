import {
  IsString,
  IsOptional,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: '20123456789', description: 'RUC 11 dígitos' })
  @IsString()
  @Matches(/^\d{11}$/, { message: 'RUC must be exactly 11 digits' })
  ruc: string;

  @ApiProperty({ example: 'Empresa SAC' })
  @IsString()
  @MaxLength(200)
  razonSocial: string;

  @ApiPropertyOptional({ example: 'Mi Empresa' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombreComercial?: string;

  @ApiProperty({ example: 'Av. Arequipa 1234, Piso 5' })
  @IsString()
  @MaxLength(300)
  direccion: string;

  @ApiProperty({ example: '150101', description: 'Ubigeo 6 dígitos' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Ubigeo must be exactly 6 digits' })
  ubigeo: string;

  @ApiProperty({ example: 'Lima' })
  @IsString()
  @MaxLength(100)
  departamento: string;

  @ApiProperty({ example: 'Lima' })
  @IsString()
  @MaxLength(100)
  provincia: string;

  @ApiProperty({ example: 'Lima' })
  @IsString()
  @MaxLength(100)
  distrito: string;

  @ApiPropertyOptional({ example: 'Urb. San Isidro' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  urbanizacion?: string;
}
