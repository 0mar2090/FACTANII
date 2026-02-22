import { Module } from '@nestjs/common';
import { ConsultationsService } from './consultations.service.js';
import { ConsultationsController } from './consultations.controller.js';

@Module({
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
