import { Module } from '@nestjs/common';
import { SunatClientService } from './sunat-client.service.js';
import { SunatGreClientService } from './sunat-gre-client.service.js';

@Module({
  providers: [SunatClientService, SunatGreClientService],
  exports: [SunatClientService, SunatGreClientService],
})
export class SunatClientModule {}
