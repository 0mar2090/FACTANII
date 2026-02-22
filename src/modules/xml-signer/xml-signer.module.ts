import { Module } from '@nestjs/common';
import { XmlSignerService } from './xml-signer.service.js';

@Module({
  providers: [XmlSignerService],
  exports: [XmlSignerService],
})
export class XmlSignerModule {}
