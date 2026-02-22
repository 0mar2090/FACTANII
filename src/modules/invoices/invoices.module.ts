import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { XmlBuilderModule } from '../xml-builder/xml-builder.module.js';
import { XmlSignerModule } from '../xml-signer/xml-signer.module.js';
import { SunatClientModule } from '../sunat-client/sunat-client.module.js';
import { CdrProcessorModule } from '../cdr-processor/cdr-processor.module.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { CompaniesModule } from '../companies/companies.module.js';

@Module({
  imports: [
    XmlBuilderModule,
    XmlSignerModule,
    SunatClientModule,
    CdrProcessorModule,
    CertificatesModule,
    CompaniesModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
