import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service.js';
import { CreateWebhookDto } from './dto/webhook.dto.js';
import { Tenant } from '../../common/decorators/tenant.decorator.js';

@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new webhook endpoint' })
  @ApiResponse({ status: 201, description: 'Webhook registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook URL or events' })
  async create(
    @Tenant() companyId: string,
    @Body() dto: CreateWebhookDto,
  ) {
    const webhook = await this.webhooksService.create(companyId, dto);
    return { success: true, data: webhook };
  }

  @Get()
  @ApiOperation({ summary: 'List all registered webhooks' })
  @ApiResponse({ status: 200, description: 'List of webhooks for the company' })
  async findAll(@Tenant() companyId: string) {
    const webhooks = await this.webhooksService.findAll(companyId);
    return { success: true, data: webhooks };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook deleted successfully' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async remove(
    @Tenant() companyId: string,
    @Param('id') id: string,
  ) {
    await this.webhooksService.remove(companyId, id);
    return { success: true };
  }
}
