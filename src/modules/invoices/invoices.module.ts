import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { XmlBuilderModule } from '../xml-builder/xml-builder.module.js';
import { XmlSignerModule } from '../xml-signer/xml-signer.module.js';
import { SunatClientModule } from '../sunat-client/sunat-client.module.js';
import { CdrProcessorModule } from '../cdr-processor/cdr-processor.module.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { PdfGeneratorModule } from '../pdf-generator/pdf-generator.module.js';
import { QUEUE_INVOICE_SEND } from '../queues/queues.constants.js';

@Module({
  imports: [
    XmlBuilderModule,
    XmlSignerModule,
    SunatClientModule,
    CdrProcessorModule,
    CertificatesModule,
    CompaniesModule,
    PdfGeneratorModule,
    BullModule.registerQueue({ name: QUEUE_INVOICE_SEND }),
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
