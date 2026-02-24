# Audit V3 Remediation — 3-Phase Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 30 defects from the third comprehensive audit across 3 phases: Critical (production blockers), High (pre-MVP), and Medium/Low (post-MVP).

**Architecture:** Surgical fixes to existing files. No new modules needed. Each fix is isolated and testable independently.

**Tech Stack:** NestJS 11 + Fastify, TypeScript strict, Prisma 7, BullMQ, xmlbuilder2, node-crypto

---

## Phase 1 — Critical (C1-C6): Production Blockers

### Task 1: C2 — Fix DebitNote LineCountNumeric ordering

**Files:**
- Modify: `src/modules/xml-builder/builders/debit-note.builder.ts:132-160`

**Context:** UBL 2.1 requires `cbc:LineCountNumeric` AFTER `cac:DebitNoteLine` elements, not before. Current code puts it at line 133 before the lines loop at 136.

**Step 1: Fix element ordering in debit-note.builder.ts**

Move `LineCountNumeric` from before the lines loop to after it (between lines and RequestedMonetaryTotal):

```typescript
// 13. Debit note lines
for (let i = 0; i < data.items.length; i++) {
  this.addDocumentLine(
    doc,
    data.items[i]!,
    i + 1,
    data.moneda,
    'cac:DebitNoteLine',
    'cbc:DebitedQuantity',
  );
}

// 14. Line count (MUST come AFTER lines per UBL 2.1 DebitNote XSD)
doc.ele('cbc:LineCountNumeric').txt(data.items.length.toString()).up();

// 15. Legal monetary totals
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/modules/xml-builder/builders/debit-note.builder.ts
git commit -m "fix(xml): move DebitNote LineCountNumeric after lines per UBL 2.1 XSD"
```

---

### Task 2: C3 — Add password change endpoint

**Files:**
- Create: `src/modules/auth/dto/change-password.dto.ts`
- Modify: `src/modules/auth/auth.service.ts` (add `changePassword` method)
- Modify: `src/modules/auth/auth.controller.ts` (add `PATCH /auth/password` endpoint)
- Modify: `src/modules/auth/dto/index.ts` (export new DTO)

**Step 1: Create ChangePasswordDto**

```typescript
// src/modules/auth/dto/change-password.dto.ts
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword123!' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ example: 'NewPassword456!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Z]/, { message: 'newPassword must contain at least one uppercase letter' })
  @Matches(/[a-z]/, { message: 'newPassword must contain at least one lowercase letter' })
  @Matches(/[0-9]/, { message: 'newPassword must contain at least one number' })
  @Matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, { message: 'newPassword must contain at least one special character' })
  newPassword!: string;
}
```

**Step 2: Add changePassword to AuthService**

```typescript
async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
  const user = await this.prisma.client.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  const isValid = await this.verifyPassword(dto.currentPassword, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedException('Current password is incorrect');
  }

  const newHash = await this.hashPassword(dto.newPassword);
  await this.prisma.client.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  this.logger.log(`Password changed for user ${userId}`);
}
```

**Step 3: Add PATCH /auth/password endpoint**

```typescript
@Patch('password')
@HttpCode(HttpStatus.OK)
@ApiBearerAuth()
@ApiOperation({ summary: 'Change current user password' })
async changePassword(
  @CurrentUser() user: RequestUser,
  @Body() dto: ChangePasswordDto,
) {
  await this.authService.changePassword(user.userId, dto);
  return { success: true, data: { message: 'Password changed successfully' } };
}
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/modules/auth/dto/change-password.dto.ts src/modules/auth/auth.service.ts src/modules/auth/auth.controller.ts src/modules/auth/dto/index.ts
git commit -m "feat(auth): add password change endpoint PATCH /auth/password"
```

---

### Task 3: C4 — Validate ENCRYPTION_KEY at startup

**Files:**
- Modify: `src/main.ts` (add validation before NestFactory.create)

**Step 1: Add ENCRYPTION_KEY validation in bootstrap**

Add at the top of the `bootstrap()` function, before NestFactory.create:

```typescript
// Validate ENCRYPTION_KEY before anything else — fail fast
const encryptionKey = process.env.ENCRYPTION_KEY;
if (!encryptionKey || encryptionKey.length !== 64) {
  console.error(
    'FATAL: ENCRYPTION_KEY must be 32 bytes (64 hex chars). ' +
    'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  );
  process.exit(1);
}
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/main.ts
git commit -m "fix(security): validate ENCRYPTION_KEY at startup — fail fast"
```

---

### Task 4: C5 — Fix processor signing already-signed XML

**Files:**
- Modify: `src/modules/queues/processors/invoice-send.processor.ts:106-138`

**Context:** The processor at line 110 checks `!invoice.xmlSigned` and tries to sign again. But the invoice was already signed in `signAndSendSoap()` before being saved. The processor should never re-sign; it should only send. If xmlContent is missing, it's an unrecoverable error.

**Step 1: Simplify the signing logic**

Replace the current block (lines 106-138) with a guard that just verifies the invoice has signed XML:

```typescript
// 4. Verify we have signed XML ready to send
if (!invoice.xmlContent || !invoice.xmlSigned) {
  this.logger.error(
    `Invoice ${invoiceId} has no signed XML — cannot send. The invoice must be regenerated.`,
  );
  await this.prisma.client.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'REJECTED',
      sunatCode: 'INTERNAL_ERROR',
      sunatMessage: 'Invoice has no signed XML content. Must be regenerated.',
      lastError: 'Missing signed XML in processor',
    },
  });
  return; // Don't retry — this needs manual intervention
}

const signedXml = invoice.xmlContent;
```

Remove the `XmlSignerService` and `CertificatesService` imports/injections from the processor since it no longer needs them.

**Step 2: Run tests**

Run: `pnpm test`
Expected: Tests pass (update invoice-send.spec.ts mocks if needed)

**Step 3: Commit**

```bash
git add src/modules/queues/processors/invoice-send.processor.ts
git commit -m "fix(processor): remove re-signing of already-signed XML in invoice-send"
```

---

### Task 5: C6 — Add AAD to AES-256-GCM encryption

**Files:**
- Modify: `src/common/utils/encryption.ts`

**Context:** AES-256-GCM supports Additional Authenticated Data (AAD) which binds the ciphertext to a context (e.g., the record type). Without AAD, ciphertext from one field could be swapped to another. Add optional AAD parameter.

**Step 1: Add AAD to encrypt/decrypt functions**

```typescript
/** Cifra un string con AES-256-GCM */
export function encrypt(plaintext: string, aad?: string): EncryptedData {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

/** Descifra datos cifrados con AES-256-GCM */
export function decrypt(data: EncryptedData, aad?: string): string {
  const key = getKey();
  const iv = Buffer.from(data.iv, 'hex');
  const authTag = Buffer.from(data.authTag, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  let decrypted = decipher.update(data.ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

Same for `encryptBuffer`/`decryptBuffer` — add optional `aad?: string` parameter.

**Important:** AAD is optional and backward-compatible. Existing encrypted data without AAD will continue to decrypt correctly when no AAD is passed.

**Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass (backward compatible)

**Step 3: Commit**

```bash
git add src/common/utils/encryption.ts
git commit -m "fix(security): add AAD support to AES-256-GCM encryption"
```

---

### Task 6: C1 — Fix correlativo race condition

**Files:**
- Modify: `src/modules/invoices/invoices.service.ts` (refactor createInvoice, createCreditNote, createDebitNote to persist inside transaction with correlativo)

**Context:** Currently correlativo is allocated via `atomicIncrementCorrelativo()` BEFORE the invoice is persisted. If XML building or SUNAT send fails, the correlativo is consumed but no invoice record exists — creating a gap. The fix: wrap correlativo allocation + invoice creation in a single transaction. If the XML build or SUNAT send fails AFTER the invoice is persisted (with status PENDING), the correlativo is preserved.

**Step 1: Restructure createInvoice flow**

Change the flow from:
1. Allocate correlativo
2. Build XML + sign + send
3. Create invoice record

To:
1. Allocate correlativo + create invoice record with status DRAFT (in transaction)
2. Build XML + sign + send
3. Update invoice with XML content and SUNAT response

The key change is that `invoice.create` happens INSIDE the atomicIncrementCorrelativo — if anything before XML build fails, the transaction rolls back and correlativo is not consumed.

**Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/modules/invoices/invoices.service.ts
git commit -m "fix(invoices): wrap correlativo + invoice creation in transaction to prevent gaps"
```

---

## Phase 2 — High (A1-A8): Pre-MVP

### Task 7: A1 — Remove conflicting retry logic

**Files:**
- Modify: `src/modules/invoices/invoices.service.ts` (remove `queueRetry` calls and method)

**Context:** The `signAndSendSoap` method catches SUNAT errors and sets `status: 'PENDING'` + `shouldRetry: true`. Then `queueRetry` adds a NEW job to BullMQ. But the invoice-send processor ALSO has BullMQ retry config (5 attempts, exponential backoff). This means a single failure can trigger BOTH manual retry AND BullMQ retry = duplicate sends.

**Step 1: Remove queueRetry method and all calls**

Remove the `queueRetry` private method entirely. Remove all `if (shouldRetry) { this.queueRetry(...) }` blocks from createInvoice, createCreditNote, createDebitNote, createRetention, createPerception. Change `signAndSendSoap` to not return `shouldRetry`. When SUNAT send fails transiently, the status stays as REJECTED (not PENDING) — the user can use the `/resend` endpoint to manually retry.

**Step 2: Run tests**

Run: `pnpm test`

**Step 3: Commit**

```bash
git add src/modules/invoices/invoices.service.ts
git commit -m "fix(invoices): remove conflicting manual retry — rely on /resend endpoint"
```

---

### Task 8: A3 — Zero-pad voided document correlativo

**Files:**
- Modify: `src/modules/xml-builder/builders/voided.builder.ts:106`

**Context:** SUNAT requires `DocumentNumberID` to be zero-padded to 8 digits. Current code: `.txt(item.correlativo.toString())`.

**Step 1: Add zero-padding**

```typescript
// Document number (zero-padded to 8 digits per SUNAT spec)
line.ele('sac:DocumentNumberID').txt(String(item.correlativo).padStart(8, '0')).up();
```

**Step 2: Run tests**

Run: `pnpm test`

**Step 3: Commit**

```bash
git add src/modules/xml-builder/builders/voided.builder.ts
git commit -m "fix(xml): zero-pad voided document correlativo to 8 digits"
```

---

### Task 9: A4 — Add clientId/clientSecret to anularGuia

**Files:**
- Modify: `src/modules/sunat-client/sunat-gre-client.service.ts:250-258`

**Context:** `anularGuia` calls `this.getToken(ruc, solUser, solPass, isBeta)` without passing `clientId`/`clientSecret`. The `getToken` method then can't resolve credentials if env vars aren't set.

**Step 1: Add parameters to anularGuia signature and token call**

```typescript
async anularGuia(
  ruc: string,
  serie: string,
  correlativo: number,
  motivo: string,
  solUser: string,
  solPass: string,
  isBeta: boolean,
  clientId?: string,
  clientSecret?: string,
): Promise<GreSendResult> {
  // ...
  const token = await this.getToken(ruc, solUser, solPass, isBeta, clientId, clientSecret);
```

**Step 2: Run tests**

Run: `pnpm test`

**Step 3: Commit**

```bash
git add src/modules/sunat-client/sunat-gre-client.service.ts
git commit -m "fix(gre): pass clientId/clientSecret to anularGuia OAuth2 token call"
```

---

### Task 10: A5 — Add JWT `aud` claim

**Files:**
- Modify: `src/modules/auth/auth.service.ts` (add `aud` to token signing)
- Modify: `src/modules/auth/strategies/jwt.strategy.ts` (validate `aud`)
- Modify: `src/common/interfaces/index.ts` (add `aud` to JwtPayload)

**Step 1: Add `aud` to generateTokens**

```typescript
// In generateTokens(), add aud to both access and refresh token payloads:
{
  sub: payload.sub,
  email: payload.email,
  companyId: payload.companyId,
  role: payload.role,
  jti: accessJti,
  aud: 'facturape-api',
}
```

**Step 2: Validate `aud` in jwt.strategy.ts**

Add audience validation in JwtStrategy constructor options:

```typescript
super({
  // ... existing options
  audience: 'facturape-api',
});
```

**Step 3: Add `aud` to JwtPayload interface**

```typescript
export interface JwtPayload {
  sub: string;
  email: string;
  companyId?: string;
  role?: string;
  jti?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}
```

**Step 4: Run tests**

Run: `pnpm test`

**Step 5: Commit**

```bash
git add src/modules/auth/auth.service.ts src/modules/auth/strategies/jwt.strategy.ts src/common/interfaces/index.ts
git commit -m "feat(auth): add JWT audience claim validation"
```

---

### Task 11: A7 — Handle Redis failure in token revocation

**Files:**
- Modify: `src/modules/auth/auth.service.ts` (logout and isTokenRevoked methods)

**Step 1: Add error handling to logout**

```typescript
async logout(accessToken: string): Promise<void> {
  try {
    const payload = this.jwtService.decode(accessToken) as JwtPayload | null;
    if (payload?.jti && payload?.exp) {
      const ttl = payload.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redis.set(`jwt_blacklist:${payload.jti}`, '1', 'EX', ttl);
      }
    }
  } catch (error) {
    // Log but don't throw — token will expire naturally
    this.logger.error(`Failed to blacklist token: ${error instanceof Error ? error.message : error}`);
  }
}

async isTokenRevoked(jti: string): Promise<boolean> {
  try {
    const result = await this.redis.get(`jwt_blacklist:${jti}`);
    return result !== null;
  } catch (error) {
    // On Redis failure, allow the request (fail-open) but log the error
    this.logger.error(`Redis check failed for token revocation: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}
```

**Step 2: Run tests**

Run: `pnpm test`

**Step 3: Commit**

```bash
git add src/modules/auth/auth.service.ts
git commit -m "fix(auth): handle Redis failures gracefully in token revocation"
```

---

### Task 12: A8 — Add password length validation to LoginDto

**Files:**
- Modify: `src/modules/auth/dto/login.dto.ts`

**Step 1: Add MaxLength to prevent DoS**

```typescript
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'user@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @MaxLength(128)
  password!: string;
}
```

**Step 2: Run tests**

Run: `pnpm test`

**Step 3: Commit**

```bash
git add src/modules/auth/dto/login.dto.ts
git commit -m "fix(auth): add MaxLength(128) to LoginDto to prevent DoS via huge passwords"
```

---

### Task 13: A2 — Improve SOAP fault parsing (array + network detection)

**Files:**
- Modify: `src/modules/sunat-client/sunat-client.service.ts` (handleSoapError method)

**Context:** SUNAT sometimes returns faultstring as an array. The current code only handles string. Also, network errors (ECONNREFUSED, ETIMEDOUT) aren't explicitly detected.

**Step 1: Update handleSoapError**

```typescript
private handleSoapError(
  operation: string,
  fileName: string,
  error: unknown,
): SunatSendResult {
  // Network errors — no SOAP response at all
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND') || msg.includes('socket hang up')) {
      this.logger.error(`${operation}: network error for ${fileName} — ${msg}`);
      return {
        success: false,
        message: `SUNAT network error: ${msg}`,
        rawFaultCode: 'NETWORK_ERROR',
        rawFaultString: msg,
      };
    }
  }

  const soapError = error as Record<string, any>;
  const faultCode = soapError?.root?.Envelope?.Body?.Fault?.faultcode;
  let faultString = soapError?.root?.Envelope?.Body?.Fault?.faultstring;

  // SUNAT sometimes returns faultstring as an array
  if (Array.isArray(faultString)) {
    faultString = faultString.join('; ');
  }

  // ... rest of existing logic with updated faultString
```

**Step 2: Run tests**

Run: `pnpm test`

**Step 3: Commit**

```bash
git add src/modules/sunat-client/sunat-client.service.ts
git commit -m "fix(sunat): handle array faultstring and network errors in SOAP parsing"
```

---

### Task 14: A6 — Salt API key hash

**Files:**
- Modify: `src/modules/auth/auth.service.ts` (createApiKey method)
- Modify: `src/modules/auth/strategies/api-key.strategy.ts` (validation)

**Context:** Currently API keys are hashed with plain SHA-256 (`createHash('sha256').update(plainKey).digest('hex')`). Add HMAC with a server secret for defense-in-depth.

**Step 1: Use HMAC-SHA256 with ENCRYPTION_KEY as secret**

```typescript
// In createApiKey:
import { createHmac } from 'node:crypto';

const keyHash = createHmac('sha256', process.env.ENCRYPTION_KEY!)
  .update(plainKey)
  .digest('hex');
```

```typescript
// In api-key.strategy.ts validation:
const keyHash = createHmac('sha256', process.env.ENCRYPTION_KEY!)
  .update(apiKey)
  .digest('hex');
```

**Note:** This is a breaking change for existing API keys. Existing keys will need to be regenerated. Add a migration note.

**Step 2: Run tests**

Run: `pnpm test`

**Step 3: Commit**

```bash
git add src/modules/auth/auth.service.ts src/modules/auth/strategies/api-key.strategy.ts
git commit -m "fix(security): use HMAC-SHA256 for API key hashing instead of plain SHA-256"
```

---

## Phase 3 — Medium/Low (M1-M8, B1-B6)

### Task 15: M3 — Fix path traversal in PDF URL

**Files:**
- Modify: `src/modules/invoices/invoices.service.ts` (PDF URL handling)

**Step 1: Sanitize PDF file path**

Add path validation wherever PDF URL is constructed:

```typescript
import { basename } from 'node:path';

// When constructing PDF path, use only basename to prevent traversal
const safeName = basename(pdfFileName);
```

**Step 2: Run tests + Commit**

---

### Task 16: M7 — Add ticketNumber to Invoice schema

**Files:**
- Modify: `prisma/schema.prisma` (add ticketNumber field)

**Step 1: Add field**

```prisma
ticketNumber  String?  @map("ticket_number")
```

**Step 2: Generate migration**

Run: `pnpm db:migrate`

**Step 3: Update invoices.service.ts to store ticket number when returned from sendSummary/sendGuide**

**Step 4: Run tests + Commit**

---

### Task 17: M8 — Replace CSP unsafe-inline with nonces (production only)

**Files:**
- Modify: `src/main.ts`

**Context:** Only change CSP for production. In non-production, keep unsafe-inline for Swagger UI.

**Step 1: Conditional CSP**

```typescript
contentSecurityPolicy: isProduction ? {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"],
  },
} : {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https://validator.swagger.io'],
    fontSrc: ["'self'"],
  },
},
```

**Step 2: Run tests + Commit**

---

### Task 18: Remaining Medium/Low fixes (M1, M2, M4, M5, M6, B1-B6)

These are lower priority improvements to be addressed incrementally:

- **M1** (fire-and-forget polling): Add `await` or error handling to ticket-poll queue.add()
- **M2** (ticket poll loses ticket on timeout): Store ticket number in invoice before marking REJECTED
- **M4** (no idempotency keys): Add jobId based on invoiceId to prevent duplicate processing
- **M5** (floating-point precision): Already using `round2` from tax-calculator — verify
- **M6** (guide element ordering): Verify against SUNAT GRE XSD
- **B1-B6**: Architectural improvements, test coverage, audit trail — ongoing work

---

## Execution Order

1. **Phase 1** (Tasks 1-6): All critical — do sequentially, commit after each
2. **Phase 2** (Tasks 7-14): High priority — do sequentially, commit after each
3. **Phase 3** (Tasks 15-18): Medium/low — can be batched

**Total estimated tasks with code changes: 18**
**Run `pnpm test` after EVERY change to catch regressions immediately.**
