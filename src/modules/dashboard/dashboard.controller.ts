import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service.js';
import { Tenant } from '../../common/decorators/tenant.decorator.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumen de emisión por estado y tipo' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'End date (YYYY-MM-DD)' })
  async getSummary(
    @Tenant() companyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.dashboardService.getSummary(companyId, from, to);
    return { success: true, data };
  }

  @Get('monthly-report')
  @ApiOperation({ summary: 'Reporte mensual para PDT 621' })
  @ApiQuery({ name: 'year', required: true, description: 'Year (e.g. 2026)' })
  @ApiQuery({ name: 'month', required: true, description: 'Month (1-12)' })
  async getMonthlyReport(
    @Tenant() companyId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const data = await this.dashboardService.getMonthlyReport(
      companyId,
      parseInt(year, 10),
      parseInt(month, 10),
    );
    return { success: true, data };
  }
}
