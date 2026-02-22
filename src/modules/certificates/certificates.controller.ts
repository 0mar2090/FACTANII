import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CertificatesService } from './certificates.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { RequestUser } from '../../common/interfaces/index.js';

@ApiTags('Certificates')
@ApiBearerAuth()
@Controller('companies/:companyId/certificate')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post()
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload a PFX digital certificate' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        passphrase: { type: 'string' },
      },
    },
  })
  async upload(
    @CurrentUser() _user: RequestUser,
    @Param('companyId') companyId: string,
    @Req() req: FastifyRequest,
  ) {
    // @fastify/multipart must be registered in main.ts
    const data = await (req as any).file();
    if (!data) {
      throw new BadRequestException('No file uploaded. Send a multipart form with "file" (PFX) field.');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const pfxBuffer = Buffer.concat(chunks);

    // Extract passphrase from fields
    const fields = data.fields as Record<string, any>;
    const passphraseField = fields?.passphrase;
    const passphrase = typeof passphraseField === 'object'
      ? passphraseField.value
      : passphraseField;

    if (!passphrase || typeof passphrase !== 'string') {
      throw new BadRequestException('Passphrase is required');
    }

    const certificate = await this.certificatesService.upload(
      companyId,
      pfxBuffer,
      passphrase,
    );

    return { success: true, data: certificate };
  }

  @Get()
  @ApiOperation({ summary: 'List certificates for a company' })
  async findAll(@Param('companyId') companyId: string) {
    const certificates = await this.certificatesService.findByCompany(companyId);
    return { success: true, data: certificates };
  }
}
