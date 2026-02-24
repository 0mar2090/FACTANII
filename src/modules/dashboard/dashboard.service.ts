import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get a summary of invoices by status and document type,
   * with optional date range filtering.
   */
  async getSummary(companyId: string, from?: string, to?: string) {
    const where: Record<string, unknown> = { companyId };
    if (from || to) {
      const fechaEmision: Record<string, Date> = {};
      if (from) fechaEmision.gte = new Date(from);
      if (to) fechaEmision.lte = new Date(to);
      where.fechaEmision = fechaEmision;
    }

    const [byStatus, byType, totals] = await Promise.all([
      this.prisma.client.invoice.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.client.invoice.groupBy({
        by: ['tipoDoc'],
        where,
        _count: true,
        _sum: { totalVenta: true },
      }),
      this.prisma.client.invoice.aggregate({
        where,
        _count: true,
        _sum: { totalVenta: true, igv: true },
      }),
    ]);

    return { byStatus, byType, totals };
  }

  /**
   * Generate a monthly report suitable for PDT 621 tax declaration.
   * Returns all accepted/observed invoices for the given month with
   * aggregated tax totals.
   */
  async getMonthlyReport(companyId: string, year: number, month: number) {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);

    const invoices = await this.prisma.client.invoice.findMany({
      where: {
        companyId,
        fechaEmision: { gte: from, lte: to },
        status: { in: ['ACCEPTED', 'OBSERVED'] },
      },
      select: {
        tipoDoc: true,
        serie: true,
        correlativo: true,
        clienteNumDoc: true,
        clienteNombre: true,
        opGravadas: true,
        opExoneradas: true,
        opInafectas: true,
        igv: true,
        isc: true,
        icbper: true,
        totalVenta: true,
        moneda: true,
        fechaEmision: true,
      },
      orderBy: [{ tipoDoc: 'asc' }, { serie: 'asc' }, { correlativo: 'asc' }],
    });

    const summary = {
      totalGravadas: invoices.reduce((acc, i) => acc + Number(i.opGravadas), 0),
      totalExoneradas: invoices.reduce((acc, i) => acc + Number(i.opExoneradas), 0),
      totalInafectas: invoices.reduce((acc, i) => acc + Number(i.opInafectas), 0),
      totalIgv: invoices.reduce((acc, i) => acc + Number(i.igv), 0),
      totalIsc: invoices.reduce((acc, i) => acc + Number(i.isc), 0),
      totalIcbper: invoices.reduce((acc, i) => acc + Number(i.icbper), 0),
      totalVenta: invoices.reduce((acc, i) => acc + Number(i.totalVenta), 0),
      documentCount: invoices.length,
    };

    return { period: `${year}-${String(month).padStart(2, '0')}`, summary, invoices };
  }
}
