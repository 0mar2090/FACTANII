import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CompaniesService } from './companies.service.js';
import { MigrationService } from './migration.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { UpdateSolCredentialsDto } from './dto/update-sol-credentials.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Tenant } from '../../common/decorators/tenant.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { SkipTenant } from '../../common/decorators/skip-tenant.decorator.js';
import type { RequestUser } from '../../common/interfaces/index.js';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly migrationService: MigrationService,
  ) {}

  @Post()
  @SkipTenant()
  @ApiOperation({ summary: 'Create a new company (tenant)' })
  @ApiResponse({ status: 201, description: 'Company created' })
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCompanyDto,
  ) {
    const company = await this.companiesService.create(user.userId, dto);
    return { success: true, data: company };
  }

  @Get()
  @SkipTenant()
  @ApiOperation({ summary: 'List companies the current user belongs to' })
  async findAll(@CurrentUser() user: RequestUser) {
    const companies = await this.companiesService.findByUser(user.userId);
    return { success: true, data: companies };
  }

  @Get(':id')
  @SkipTenant()
  @ApiOperation({ summary: 'Get company details' })
  async findOne(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    // Verify user belongs to this company
    await this.companiesService.ensureUserBelongs(user.userId, id);
    const company = await this.companiesService.findById(id);
    return { success: true, data: company };
  }

  @Put(':id')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Update company details' })
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    await this.companiesService.ensureUserBelongs(user.userId, id);
    const company = await this.companiesService.update(id, dto);
    return { success: true, data: company };
  }

  @Put(':id/sol-credentials')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update SUNAT SOL credentials (encrypted)' })
  async updateSolCredentials(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateSolCredentialsDto,
  ) {
    await this.companiesService.ensureUserBelongs(user.userId, id);
    const result = await this.companiesService.updateSolCredentials(id, dto);
    return { success: true, data: result };
  }

  @Get(':id/migration-status')
  @ApiOperation({ summary: 'Check if company is ready to migrate from beta to production' })
  @ApiResponse({ status: 200, description: 'Migration readiness check result' })
  async checkMigrationStatus(
    @Tenant() companyId: string,
    @Param('id') id: string,
  ) {
    const result = await this.migrationService.checkMigrationReadiness(id);
    return { success: true, data: result };
  }

  @Post(':id/migrate-to-production')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Migrate company from beta to production SUNAT environment' })
  @ApiResponse({ status: 200, description: 'Company migrated to production' })
  async migrateToProduction(
    @Tenant() companyId: string,
    @Param('id') id: string,
  ) {
    const result = await this.migrationService.migrateToProduction(id);
    return { success: true, data: result };
  }

  @Post(':id/revert-to-beta')
  @Roles('owner', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revert company from production back to beta (emergency rollback)' })
  @ApiResponse({ status: 200, description: 'Company reverted to beta' })
  async revertToBeta(
    @Tenant() companyId: string,
    @Param('id') id: string,
  ) {
    const result = await this.migrationService.revertToBeta(id);
    return { success: true, data: result };
  }
}
