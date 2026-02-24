import { Module } from '@nestjs/common';
import { ConsultationsService } from './consultations.service.js';
import { ConsultationsController } from './consultations.controller.js';
import { SunatClientModule } from '../sunat-client/sunat-client.module.js';

@Module({
  imports: [SunatClientModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
