import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { isValidRuc } from '../utils/ruc-validator.js';

@Injectable()
export class ParseRucPipe implements PipeTransform<string> {
  transform(value: string): string {
    if (!isValidRuc(value)) {
      throw new BadRequestException(`Invalid RUC: ${value}`);
    }
    return value;
  }
}
