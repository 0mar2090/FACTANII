# FacturaPE Backend

Backend SaaS de facturación electrónica conectado **directo a SUNAT** (SEE-Del Contribuyente).

## Stack
NestJS 11 · Fastify 5 · Prisma 7 · PostgreSQL 16 · Redis 7 · BullMQ 5

## Quick Start

```bash
# 1. Copiar env
cp .env.example .env

# 2. Levantar BD y Redis
docker compose up -d

# 3. Instalar dependencias
pnpm install

# 4. Generar Prisma client + migrar
pnpm db:generate
pnpm db:migrate

# 5. Seed (planes y catálogos)
pnpm db:seed

# 6. Desarrollo
pnpm dev
```

API: `http://localhost:3000/api/v1`
Docs: `http://localhost:3000/docs`

## Arquitectura

Ver **CLAUDE.md** para especificaciones completas de arquitectura, schema de BD, endpoints, y orden de implementación.

## Flujo de Facturación

```
JSON → Validar → XML UBL 2.1 → Firmar XMLDSig → ZIP → SOAP a SUNAT → CDR → PDF → Email
```

Todo el pipeline es propio. Sin intermediarios PSE/OSE.
