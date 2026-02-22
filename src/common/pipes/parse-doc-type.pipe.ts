import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { TIPO_DOCUMENTO } from '../constants/index.js';

const VALID_TYPES = Object.values(TIPO_DOCUMENTO);

@Injectable()
export class ParseDocTypePipe implements PipeTransform<string> {
  transform(value: string): string {
    if (!VALID_TYPES.includes(value as any)) {
      throw new BadRequestException(`Invalid document type: ${value}. Valid: ${VALID_TYPES.join(', ')}`);
    }
    return value;
  }
}
