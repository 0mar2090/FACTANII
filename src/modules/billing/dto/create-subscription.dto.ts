import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty({
    description: 'Slug del plan a suscribir',
    example: 'pro',
  })
  @IsString()
  planSlug!: string;

  @ApiPropertyOptional({
    description: 'URL de retorno después del pago en Mercado Pago',
    example: 'https://app.facturape.com/billing',
  })
  @IsOptional()
  @IsString()
  backUrl?: string;
}
