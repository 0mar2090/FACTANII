import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadCertificateDto {
  @ApiProperty({ description: 'PFX certificate passphrase' })
  @IsString()
  @MaxLength(128)
  passphrase: string;
}
