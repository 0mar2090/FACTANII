import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { MigrationService } from './migration.service.js';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, MigrationService],
  exports: [CompaniesService, MigrationService],
})
export class CompaniesModule {}
