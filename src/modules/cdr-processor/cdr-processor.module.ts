import { Module } from '@nestjs/common';
import { CdrProcessorService } from './cdr-processor.service.js';

@Module({
  providers: [CdrProcessorService],
  exports: [CdrProcessorService],
})
export class CdrProcessorModule {}
