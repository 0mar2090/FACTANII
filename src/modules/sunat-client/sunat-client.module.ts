import { Module } from '@nestjs/common';
import { SunatClientService } from './sunat-client.service.js';

@Module({
  providers: [SunatClientService],
  exports: [SunatClientService],
})
export class SunatClientModule {}
