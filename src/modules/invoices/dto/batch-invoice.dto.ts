import { IsArray, ValidateNested, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateInvoiceDto } from './create-invoice.dto.js';

export class BatchInvoiceDto {
  @ApiProperty({
    description: 'Array of invoice DTOs to process in batch (max 50)',
    type: [CreateInvoiceDto],
    minItems: 1,
    maxItems: 50,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceDto)
  invoices!: CreateInvoiceDto[];
}

export interface BatchInvoiceResult {
  index: number;
  success: boolean;
  invoiceId?: string;
  serie?: string;
  correlativo?: number;
  error?: string;
}
