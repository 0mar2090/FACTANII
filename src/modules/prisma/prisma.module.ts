import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * PrismaModule — Global module providing PrismaService to the entire application.
 *
 * Marked as @Global() so any module can inject PrismaService without
 * importing PrismaModule explicitly. This is the recommended pattern
 * for database access in NestJS multi-module applications.
 *
 * Dependencies (must be imported in AppModule before this module):
 * - ConfigModule (global) — provides DATABASE_URL and NODE_ENV
 * - ClsModule (global) — provides AsyncLocalStorage for tenant context
 *
 * Usage in any service:
 *   constructor(private readonly prisma: PrismaService) {}
 *
 *   // Direct client access (no RLS):
 *   const users = await this.prisma.client.user.findMany();
 *
 *   // Tenant-scoped transaction (with RLS):
 *   const invoices = await this.prisma.withTenant(async (tx) => {
 *     return tx.invoice.findMany();
 *   });
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
