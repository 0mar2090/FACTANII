import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSolCredentialsDto {
  @ApiProperty({ example: 'MODDATOS', description: 'Usuario SOL de SUNAT' })
  @IsString()
  @MaxLength(20)
  solUser: string;

  @ApiProperty({ example: 'moddatos', description: 'Clave SOL de SUNAT' })
  @IsString()
  @MaxLength(20)
  solPass: string;
}
