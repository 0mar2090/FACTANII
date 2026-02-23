import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import { CreateWebhookDto } from './dto/webhook.dto.js';
import { Tenant } from '../../common/decorators/tenant.decorator.js';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  async create(
    @Tenant() companyId: string,
    @Body() dto: CreateWebhookDto,
  ) {
    const webhook = await this.webhooksService.create(companyId, dto);
    return { success: true, data: webhook };
  }

  @Get()
  async findAll(@Tenant() companyId: string) {
    const webhooks = await this.webhooksService.findAll(companyId);
    return { success: true, data: webhooks };
  }

  @Delete(':id')
  async remove(
    @Tenant() companyId: string,
    @Param('id') id: string,
  ) {
    await this.webhooksService.remove(companyId, id);
    return { success: true };
  }
}
