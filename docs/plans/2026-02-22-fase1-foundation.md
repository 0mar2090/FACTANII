# Fase 1 — Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all Phase 1 foundation modules: config, Prisma service, auth (JWT+API Keys), companies CRUD, certificates, and all global infrastructure (guards, filters, interceptors, decorators, middleware, pipes).

**Architecture:** NestJS 11 + Fastify 5, multi-tenant via CLS + PG RLS, Prisma 7 with driver adapter. All modules follow NestJS patterns. Auth uses JWT (15min access + 7d refresh rotation) + API Keys (SHA-256 hashed). Encryption via AES-256-GCM for certificates/SOL credentials.

**Tech Stack:** NestJS 11, Fastify 5, Prisma 7 (@prisma/adapter-pg), passport-jwt, bcrypt via node:crypto, nestjs-cls

**Full spec:** See CLAUDE.md at project root.

---

## Task Groups (parallelizable)

### Group A — Infrastructure

**Task 1: Config module**
- `src/config/app.config.ts` — registerAs('app')
- `src/config/database.config.ts` — registerAs('database')
- `src/config/redis.config.ts` — registerAs('redis')
- `src/config/jwt.config.ts` — registerAs('jwt')
- `src/config/sunat.config.ts` — registerAs('sunat')
- `src/config/mercadopago.config.ts` — registerAs('mercadopago')

**Task 2: Prisma module**
- `src/modules/prisma/prisma.module.ts` — Global module
- `src/modules/prisma/prisma.service.ts` — PrismaClient with PrismaPg adapter, CLS tenant extension

### Group B — Common Infrastructure

**Task 3: Decorators**
- `@CurrentUser()` — param decorator extracting user from request
- `@Tenant()` — param decorator extracting companyId from CLS
- `@Public()` — set metadata to skip auth
- `@ApiKeyAuth()` — set metadata for API key route
- `@Roles()` — set metadata for role-based access

**Task 4: Guards**
- `JwtAuthGuard` — extends AuthGuard('jwt'), respects @Public
- `ApiKeyGuard` — validates x-api-key header
- `TenantGuard` — ensures companyId resolved in CLS
- `RolesGuard` — checks user role against @Roles metadata

**Task 5: Filters + Interceptors + Pipes**
- `HttpExceptionFilter` — standard API error format
- `PrismaExceptionFilter` — P2002, P2025, etc.
- `LoggingInterceptor` — request/response logging
- `TimeoutInterceptor` — 30s default
- `ParseRucPipe` — validate RUC param
- `ParseDocTypePipe` — validate doc type param

**Task 6: Middleware + Interfaces**
- `TenantMiddleware` — extract companyId from JWT/API key, store in CLS
- Common interfaces (ApiResponse, PaginatedResponse, JwtPayload)

### Group C — Feature Modules

**Task 7: Auth module**
- `auth.module.ts`, `auth.controller.ts`, `auth.service.ts`
- `strategies/jwt.strategy.ts`, `strategies/api-key.strategy.ts`
- `dto/register.dto.ts`, `dto/login.dto.ts`, `dto/refresh-token.dto.ts`
- Endpoints: POST /auth/register, /auth/login, /auth/refresh, /auth/api-keys

**Task 8: Users module**
- `users.module.ts`, `users.service.ts`, `users.controller.ts`
- Basic CRUD for user profile

**Task 9: Companies module**
- `companies.module.ts`, `companies.controller.ts`, `companies.service.ts`
- `dto/create-company.dto.ts`, `dto/update-company.dto.ts`, `dto/update-sol-credentials.dto.ts`
- CRUD + SOL credentials (encrypted)

**Task 10: Certificates module**
- `certificates.module.ts`, `certificates.service.ts`
- `dto/upload-certificate.dto.ts`
- Upload PFX, validate, extract info, encrypt, store

### Group D — Integration

**Task 11: Wire app.module.ts**
- Import all modules, register global guards/filters/interceptors
- Verify compilation with `pnpm build`
