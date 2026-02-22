import {
  IsString,
  IsArray,
  IsOptional,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Webhook event types emitted by the system.
 */
export type WebhookEvent =
  | 'invoice.created'
  | 'invoice.accepted'
  | 'invoice.rejected'
  | 'invoice.observed'
  | 'summary.queued'
  | 'summary.accepted'
  | 'summary.rejected';

/**
 * Payload sent to webhook endpoints.
 */
export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: {
    id: string;
    tipoDoc: string;
    serie: string;
    correlativo: number;
    status: string;
    sunatCode?: string;
    sunatMessage?: string;
    [key: string]: any;
  };
}

/**
 * DTO for registering a webhook endpoint (future use).
 */
export class CreateWebhookDto {
  @ApiProperty({
    example: 'https://mi-sistema.com/webhooks/facturape',
    description: 'URL to receive webhook POST requests',
  })
  @IsString()
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({
    example: ['invoice.created', 'invoice.accepted', 'invoice.rejected'],
    description: 'List of events to subscribe to',
  })
  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @ApiPropertyOptional({
    example: 'whsec_abc123...',
    description: 'Shared secret for HMAC-SHA256 signature verification',
  })
  @IsOptional()
  @IsString()
  secret?: string;
}
