import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://facturape:facturape@localhost:5432/facturape',
  },
  migrate: {
    adapter: async () => {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      return new PrismaPg({
        connectionString: process.env.DATABASE_URL || 'postgresql://facturape:facturape@localhost:5432/facturape',
      });
    },
  },
});
