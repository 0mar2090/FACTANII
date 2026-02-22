import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // Planes de suscripción
  const plans = [
    {
      name: 'Starter',
      slug: 'starter',
      priceMonthly: 49,
      maxInvoices: 100,
      maxCompanies: 1,
      features: {
        webhooks: false,
        whatsapp: false,
        pdfCustom: false,
        apiAccess: true,
        support: 'email',
      },
    },
    {
      name: 'Pro',
      slug: 'pro',
      priceMonthly: 149,
      maxInvoices: 500,
      maxCompanies: 3,
      features: {
        webhooks: true,
        whatsapp: false,
        pdfCustom: true,
        apiAccess: true,
        support: 'email+chat',
      },
    },
    {
      name: 'Business',
      slug: 'business',
      priceMonthly: 299,
      maxInvoices: 2000,
      maxCompanies: 10,
      features: {
        webhooks: true,
        whatsapp: true,
        pdfCustom: true,
        apiAccess: true,
        support: 'priority',
      },
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      priceMonthly: 599,
      maxInvoices: 999999,
      maxCompanies: 999,
      features: {
        webhooks: true,
        whatsapp: true,
        pdfCustom: true,
        apiAccess: true,
        support: 'dedicated',
        sla: true,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
    console.log(`  ✅ Plan: ${plan.name} — S/ ${plan.priceMonthly}/mes`);
  }

  console.log('✅ Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
