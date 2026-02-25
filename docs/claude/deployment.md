# Deployment — FacturaPE Backend

## Variables de Entorno (.env)

```env
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1
CORS_ORIGIN=http://localhost:3001

# Database
DATABASE_URL=postgresql://facturape:facturape@localhost:5432/facturape

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=tu-secret-seguro-min-32-chars
JWT_EXPIRATION=15m
JWT_REFRESH_SECRET=otro-secret-seguro
JWT_REFRESH_EXPIRATION=7d

# Encryption (32 bytes hex = 64 chars)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# SUNAT — SOAP
SUNAT_ENV=beta
SUNAT_BETA_RUC=20000000001
SUNAT_BETA_USER=MODDATOS
SUNAT_BETA_PASS=moddatos

# SUNAT — GRE REST API (OAuth2)
SUNAT_GRE_CLIENT_ID=
SUNAT_GRE_CLIENT_SECRET=

# Mercado Pago
MP_ACCESS_TOKEN=TEST-xxx
MP_WEBHOOK_SECRET=xxx

# Resend
RESEND_API_KEY=re_xxx
EMAIL_FROM=facturas@tudominio.com

# Sentry (opcional)
SENTRY_DSN=

# Rate Limiting (opcionales, usan defaults)
RATE_LIMIT_SHORT_TTL=1000
RATE_LIMIT_SHORT_LIMIT=3
RATE_LIMIT_MEDIUM_TTL=10000
RATE_LIMIT_MEDIUM_LIMIT=20
RATE_LIMIT_LONG_TTL=60000
RATE_LIMIT_LONG_LIMIT=100
```

## Docker Compose (desarrollo)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: facturape-db
    environment:
      POSTGRES_USER: facturape
      POSTGRES_PASSWORD: facturape
      POSTGRES_DB: facturape
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U facturape"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: facturape-redis
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build: .
    container_name: facturape-app
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

## Dockerfile

Multi-stage build (deps → build → production), Node 22-alpine, dumb-init for PID 1, runs as non-root `node` user.

## Graceful Shutdown

`main.ts` implements graceful shutdown with 30s hard timeout for BullMQ queue drain.
