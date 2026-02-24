import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the zip utility before importing the processor (ESM hoisting)
// ---------------------------------------------------------------------------

const { mockCreateZipFromXml } = vi.hoisted(() => {
  return {
    mockCreateZipFromXml: vi.fn().mockResolvedValue(Buffer.from('fake-zip')),
  };
});

vi.mock('../../../common/utils/zip.js', () => ({
  createZipFromXml: mockCreateZipFromXml,
}));

// ---------------------------------------------------------------------------
// Import the processor after mocks are registered
// ---------------------------------------------------------------------------

import { InvoiceSendProcessor } from './invoice-send.processor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comp-1',
    ruc: '20000000001',
    razonSocial: 'Test SAC',
    direccion: 'Lima',
    ubigeo: '150101',
    departamento: 'LIMA',
    provincia: 'LIMA',
    distrito: 'LIMA',
    codigoPais: 'PE',
    isBeta: true,
    serieFactura: 'F001',
    serieBoleta: 'B001',
    isActive: true,
    nombreComercial: null,
    urbanizacion: null,
    solUser: null,
    solPass: null,
    solIv: null,
    solTag: null,
    nextCorrelativo: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-001',
    companyId: 'comp-1',
    tipoDoc: '01',
    serie: 'F001',
    correlativo: 1,
    tipoOperacion: '0101',
    fechaEmision: new Date('2026-02-23'),
    fechaVencimiento: null,
    clienteTipoDoc: '6',
    clienteNumDoc: '20100000001',
    clienteNombre: 'EMPRESA SRL',
    clienteDireccion: 'Av. Test 123',
    clienteEmail: 'cliente@example.com',
    moneda: 'PEN',
    opGravadas: 200,
    opExoneradas: 0,
    opInafectas: 0,
    opGratuitas: 0,
    igv: 36,
    isc: 0,
    icbper: 0,
    otrosCargos: 0,
    otrosTributos: 0,
    descuentoGlobal: 0,
    totalVenta: 236,
    formaPago: 'Contado',
    cuotas: null,
    docRefTipo: null,
    docRefSerie: null,
    docRefCorrelativo: null,
    motivoNota: null,
    xmlContent: '<signedXml/>',
    xmlHash: 'abc123',
    xmlSigned: true,
    status: 'QUEUED',
    sunatCode: null,
    sunatMessage: null,
    sunatNotes: null,
    cdrZip: null,
    pdfUrl: null,
    sentAt: null,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item-001',
        invoiceId: 'inv-001',
        cantidad: 2,
        unidadMedida: 'NIU',
        descripcion: 'Producto de prueba',
        codigo: null,
        codigoSunat: null,
        valorUnitario: 100,
        precioUnitario: 118,
        valorVenta: 200,
        tipoAfectacion: '10',
        igv: 36,
        isc: 0,
        icbper: 0,
        descuento: 0,
      },
    ],
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    data: { invoiceId: 'inv-001', companyId: 'comp-1' },
    attemptsMade: 0,
    opts: { attempts: 5 },
    ...overrides,
  } as any;
}

function makeCdrResult(overrides: Record<string, unknown> = {}) {
  return {
    responseCode: '0',
    description: 'La Factura numero F001-00000001, ha sido aceptada',
    isAccepted: true,
    hasObservations: false,
    notes: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMocks() {
  const prisma = {
    client: {
      invoice: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      company: {
        findUnique: vi.fn(),
      },
    },
  };

  const xmlBuilder = {
    buildInvoice: vi.fn(),
    buildCreditNote: vi.fn(),
    buildDebitNote: vi.fn(),
    buildSummary: vi.fn(),
    buildVoided: vi.fn(),
    buildRetention: vi.fn(),
    buildPerception: vi.fn(),
    buildGuide: vi.fn(),
  };

  const xmlSigner = {
    sign: vi.fn(),
    getXmlHash: vi.fn(),
    getDigestValue: vi.fn(),
  };

  const sunatClient = {
    sendBill: vi.fn(),
    sendSummary: vi.fn(),
    getStatus: vi.fn(),
    consultCdr: vi.fn(),
  };

  const cdrProcessor = {
    processCdr: vi.fn(),
  };

  const certificates = {
    getActiveCertificate: vi.fn(),
  };

  const companies = {
    getSolCredentials: vi.fn(),
  };

  const webhooks = {
    notifyInvoiceStatus: vi.fn(),
  };

  const pdfQueue = { add: vi.fn() };
  const emailQueue = { add: vi.fn() };

  return {
    prisma,
    xmlBuilder,
    xmlSigner,
    sunatClient,
    cdrProcessor,
    certificates,
    companies,
    webhooks,
    pdfQueue,
    emailQueue,
  };
}

function createProcessor(mocks: ReturnType<typeof createMocks>) {
  return new InvoiceSendProcessor(
    mocks.prisma as any,
    mocks.xmlBuilder as any,
    mocks.xmlSigner as any,
    mocks.sunatClient as any,
    mocks.cdrProcessor as any,
    mocks.certificates as any,
    mocks.companies as any,
    mocks.webhooks as any,
    mocks.pdfQueue as any,
    mocks.emailQueue as any,
  );
}

/**
 * Sets up all mocks for the happy path: invoice found, already signed,
 * beta company, SUNAT accepts.
 */
function setupHappyPath(mocks: ReturnType<typeof createMocks>) {
  mocks.prisma.client.invoice.findFirst.mockResolvedValue(makeInvoice());
  mocks.prisma.client.invoice.update.mockResolvedValue(makeInvoice({ status: 'ACCEPTED' }));
  mocks.prisma.client.company.findUnique.mockResolvedValue(makeCompany());

  mocks.sunatClient.sendBill.mockResolvedValue({
    success: true,
    code: '0',
    message: 'CDR received from SUNAT',
    cdrZip: Buffer.from('fake-cdr-zip'),
  });

  mocks.cdrProcessor.processCdr.mockReturnValue(makeCdrResult());

  mocks.webhooks.notifyInvoiceStatus.mockResolvedValue(undefined);
  mocks.pdfQueue.add.mockResolvedValue({ id: 'pdf-job-1' });
  mocks.emailQueue.add.mockResolvedValue({ id: 'email-job-1' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvoiceSendProcessor', () => {
  let mocks: ReturnType<typeof createMocks>;
  let processor: InvoiceSendProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateZipFromXml.mockResolvedValue(Buffer.from('fake-zip'));
    mocks = createMocks();
    processor = createProcessor(mocks);
  });

  // ── 1. Happy path — ACCEPTED ───────────────────────────────────────

  describe('happy path — ACCEPTED', () => {
    beforeEach(() => {
      setupHappyPath(mocks);
    });

    it('should process an already-signed invoice and update status to ACCEPTED', async () => {
      const job = makeJob();

      await processor.process(job);

      // Should have loaded the invoice
      expect(mocks.prisma.client.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: 'inv-001', companyId: 'comp-1' },
        include: { items: true },
      });

      // Should have set status to SENDING first
      expect(mocks.prisma.client.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-001' },
          data: expect.objectContaining({ status: 'SENDING' }),
        }),
      );

      // Should have sent to SUNAT
      expect(mocks.sunatClient.sendBill).toHaveBeenCalledOnce();

      // Should have processed CDR
      expect(mocks.cdrProcessor.processCdr).toHaveBeenCalledWith(
        Buffer.from('fake-cdr-zip'),
      );

      // Should have updated status to ACCEPTED
      expect(mocks.prisma.client.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-001' },
          data: expect.objectContaining({
            status: 'ACCEPTED',
            sunatCode: '0',
            sunatMessage: 'La Factura numero F001-00000001, ha sido aceptada',
            lastError: null,
          }),
        }),
      );
    });

    it('should trigger the post-send pipeline (webhook, PDF, email)', async () => {
      const job = makeJob();

      await processor.process(job);

      // Webhook dispatched
      expect(mocks.webhooks.notifyInvoiceStatus).toHaveBeenCalledOnce();
      expect(mocks.webhooks.notifyInvoiceStatus).toHaveBeenCalledWith(
        'comp-1',
        expect.objectContaining({ id: 'inv-001', status: 'ACCEPTED' }),
        'invoice.accepted',
      );

      // PDF queued
      expect(mocks.pdfQueue.add).toHaveBeenCalledOnce();
      expect(mocks.pdfQueue.add).toHaveBeenCalledWith(
        'post-send-pdf',
        expect.objectContaining({ invoiceId: 'inv-001', companyId: 'comp-1', format: 'a4' }),
        expect.any(Object),
      );

      // Email queued (clienteEmail is set)
      expect(mocks.emailQueue.add).toHaveBeenCalledOnce();
      expect(mocks.emailQueue.add).toHaveBeenCalledWith(
        'invoice-notification',
        expect.objectContaining({
          to: 'cliente@example.com',
          subject: expect.stringContaining('F001'),
        }),
        expect.any(Object),
      );
    });

    it('should create the correct ZIP file name with padded correlativo', async () => {
      const job = makeJob();

      await processor.process(job);

      // createZipFromXml should have been called with the padded correlativo
      expect(mockCreateZipFromXml).toHaveBeenCalledWith(
        '<signedXml/>',
        '20000000001-01-F001-00000001.xml',
      );
    });
  });

  // ── 2. Happy path — OBSERVED ───────────────────────────────────────

  describe('happy path — OBSERVED', () => {
    it('should set status to OBSERVED when CDR has observations', async () => {
      setupHappyPath(mocks);
      mocks.cdrProcessor.processCdr.mockReturnValue(
        makeCdrResult({
          responseCode: '4000',
          description: 'La Factura numero F001-00000001, ha sido aceptada con observaciones',
          isAccepted: true,
          hasObservations: true,
          notes: ['4000 - Observacion ejemplo'],
        }),
      );

      const job = makeJob();
      await processor.process(job);

      // Should update to OBSERVED
      expect(mocks.prisma.client.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-001' },
          data: expect.objectContaining({
            status: 'OBSERVED',
            sunatCode: '4000',
            sunatNotes: ['4000 - Observacion ejemplo'],
          }),
        }),
      );

      // Webhook should use 'invoice.accepted' for OBSERVED too
      expect(mocks.webhooks.notifyInvoiceStatus).toHaveBeenCalledWith(
        'comp-1',
        expect.objectContaining({ status: 'OBSERVED' }),
        'invoice.accepted',
      );

      // Email should still be queued for OBSERVED
      expect(mocks.emailQueue.add).toHaveBeenCalledOnce();
    });
  });

  // ── 3. REJECTED ────────────────────────────────────────────────────

  describe('REJECTED by CDR', () => {
    it('should set status to REJECTED and not queue email', async () => {
      setupHappyPath(mocks);
      mocks.cdrProcessor.processCdr.mockReturnValue(
        makeCdrResult({
          responseCode: '2800',
          description: 'El comprobante fue registrado previamente',
          isAccepted: false,
          hasObservations: false,
          notes: [],
        }),
      );

      const job = makeJob();
      await processor.process(job);

      // Status should be REJECTED
      expect(mocks.prisma.client.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-001' },
          data: expect.objectContaining({
            status: 'REJECTED',
            sunatCode: '2800',
          }),
        }),
      );

      // Webhook with 'invoice.rejected'
      expect(mocks.webhooks.notifyInvoiceStatus).toHaveBeenCalledWith(
        'comp-1',
        expect.objectContaining({ status: 'REJECTED' }),
        'invoice.rejected',
      );

      // PDF should still be queued
      expect(mocks.pdfQueue.add).toHaveBeenCalledOnce();

      // Email should NOT be queued for REJECTED
      expect(mocks.emailQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── 4. Invoice not found ───────────────────────────────────────────

  describe('invoice not found', () => {
    it('should return without error (skip)', async () => {
      mocks.prisma.client.invoice.findFirst.mockResolvedValue(null);

      const job = makeJob();
      await expect(processor.process(job)).resolves.toBeUndefined();

      // Should not have done any further processing
      expect(mocks.prisma.client.invoice.update).not.toHaveBeenCalled();
      expect(mocks.sunatClient.sendBill).not.toHaveBeenCalled();
      expect(mocks.pdfQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── 5. Already ACCEPTED — skipped ──────────────────────────────────

  describe('already ACCEPTED', () => {
    it('should skip processing for terminal state ACCEPTED', async () => {
      mocks.prisma.client.invoice.findFirst.mockResolvedValue(
        makeInvoice({ status: 'ACCEPTED' }),
      );

      const job = makeJob();
      await expect(processor.process(job)).resolves.toBeUndefined();

      // Status should not be changed at all; update should not be called
      expect(mocks.prisma.client.invoice.update).not.toHaveBeenCalled();
      expect(mocks.sunatClient.sendBill).not.toHaveBeenCalled();
    });

    it('should skip processing for terminal state OBSERVED', async () => {
      mocks.prisma.client.invoice.findFirst.mockResolvedValue(
        makeInvoice({ status: 'OBSERVED' }),
      );

      const job = makeJob();
      await expect(processor.process(job)).resolves.toBeUndefined();

      expect(mocks.prisma.client.invoice.update).not.toHaveBeenCalled();
      expect(mocks.sunatClient.sendBill).not.toHaveBeenCalled();
    });
  });

  // ── 6. No signed XML — rebuild and sign ────────────────────────────

  describe('no signed XML — rebuild and sign', () => {
    it('should re-sign the XML when xmlSigned=false', async () => {
      const unsignedInvoice = makeInvoice({
        xmlSigned: false,
        xmlContent: '<unsignedXml/>',
        xmlHash: null,
      });
      mocks.prisma.client.invoice.findFirst.mockResolvedValue(unsignedInvoice);
      mocks.prisma.client.invoice.update.mockResolvedValue(
        makeInvoice({ status: 'ACCEPTED' }),
      );
      mocks.prisma.client.company.findUnique.mockResolvedValue(makeCompany());

      mocks.certificates.getActiveCertificate.mockResolvedValue({
        pfxBuffer: Buffer.from('fake-pfx'),
        passphrase: '12345678',
      });

      mocks.xmlSigner.sign.mockReturnValue('<reSignedXml/>');
      mocks.xmlSigner.getXmlHash.mockReturnValue('newhash');

      mocks.sunatClient.sendBill.mockResolvedValue({
        success: true,
        cdrZip: Buffer.from('fake-cdr'),
      });
      mocks.cdrProcessor.processCdr.mockReturnValue(makeCdrResult());
      mocks.webhooks.notifyInvoiceStatus.mockResolvedValue(undefined);
      mocks.pdfQueue.add.mockResolvedValue({ id: 'pdf-1' });
      mocks.emailQueue.add.mockResolvedValue({ id: 'email-1' });

      const job = makeJob();
      await processor.process(job);

      // Should load the certificate
      expect(mocks.certificates.getActiveCertificate).toHaveBeenCalledWith('comp-1');

      // Should sign the XML
      expect(mocks.xmlSigner.sign).toHaveBeenCalledWith(
        '<unsignedXml/>',
        Buffer.from('fake-pfx'),
        '12345678',
      );
      expect(mocks.xmlSigner.getXmlHash).toHaveBeenCalledWith('<reSignedXml/>');

      // Should update DB with signed XML
      expect(mocks.prisma.client.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-001' },
          data: expect.objectContaining({
            xmlContent: '<reSignedXml/>',
            xmlHash: 'newhash',
            xmlSigned: true,
          }),
        }),
      );

      // Should create ZIP with the re-signed XML
      expect(mockCreateZipFromXml).toHaveBeenCalledWith(
        '<reSignedXml/>',
        expect.stringContaining('20000000001-01-F001'),
      );

      // Should still send to SUNAT
      expect(mocks.sunatClient.sendBill).toHaveBeenCalledOnce();
    });
  });

  // ── 7. No XML content at all ───────────────────────────────────────

  describe('no XML content at all', () => {
    it('should throw an error when xmlContent is null and xmlSigned is false', async () => {
      mocks.prisma.client.invoice.findFirst.mockResolvedValue(
        makeInvoice({ xmlContent: null, xmlSigned: false, xmlHash: null }),
      );
      mocks.prisma.client.invoice.update.mockResolvedValue({});
      mocks.prisma.client.company.findUnique.mockResolvedValue(makeCompany());
      mocks.certificates.getActiveCertificate.mockResolvedValue({
        pfxBuffer: Buffer.from('fake-pfx'),
        passphrase: '12345678',
      });

      const job = makeJob();

      await expect(processor.process(job)).rejects.toThrow(
        /no XML content/i,
      );

      // Should not have sent to SUNAT
      expect(mocks.sunatClient.sendBill).not.toHaveBeenCalled();
    });
  });

  // ── 8. SUNAT error without CDR — non-last attempt ──────────────────

  describe('SUNAT error without CDR — non-last attempt', () => {
    it('should keep status as SENDING and throw for retry', async () => {
      setupHappyPath(mocks);
      mocks.sunatClient.sendBill.mockResolvedValue({
        success: false,
        code: 'soap-env:Client',
        message: 'Connection timeout',
        rawFaultCode: 'soap-env:Client',
        rawFaultString: 'Connection timeout',
        cdrZip: undefined,
      });

      const job = makeJob({ attemptsMade: 1, opts: { attempts: 5 } });

      await expect(processor.process(job)).rejects.toThrow(
        /SUNAT sendBill failed/,
      );

      // Status should stay SENDING (not last attempt: attemptsMade+1 = 2 < 5)
      expect(mocks.prisma.client.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-001' },
          data: expect.objectContaining({
            status: 'SENDING',
            lastError: 'Connection timeout',
          }),
        }),
      );

      // No post-send pipeline
      expect(mocks.webhooks.notifyInvoiceStatus).not.toHaveBeenCalled();
      expect(mocks.pdfQueue.add).not.toHaveBeenCalled();
      expect(mocks.emailQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── 9. SUNAT error — last attempt ──────────────────────────────────

  describe('SUNAT error — last attempt', () => {
    it('should set status to REJECTED on the final attempt and throw', async () => {
      setupHappyPath(mocks);
      mocks.sunatClient.sendBill.mockResolvedValue({
        success: false,
        code: 'soap-env:Server',
        message: 'Internal SUNAT error',
        rawFaultCode: 'soap-env:Server',
        rawFaultString: 'Internal SUNAT error',
        cdrZip: undefined,
      });

      // attemptsMade=4 means this is the 5th attempt (0-indexed), matching maxAttempts=5
      const job = makeJob({ attemptsMade: 4, opts: { attempts: 5 } });

      await expect(processor.process(job)).rejects.toThrow(
        /SUNAT sendBill failed/,
      );

      // Status should be REJECTED on last attempt
      expect(mocks.prisma.client.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-001' },
          data: expect.objectContaining({
            status: 'REJECTED',
            lastError: 'Internal SUNAT error',
          }),
        }),
      );
    });
  });

  // ── 10. Beta credentials ───────────────────────────────────────────

  describe('beta credentials', () => {
    it('should use MODDATOS/moddatos when company.isBeta=true', async () => {
      setupHappyPath(mocks);
      mocks.prisma.client.company.findUnique.mockResolvedValue(
        makeCompany({ isBeta: true }),
      );

      const job = makeJob();
      await processor.process(job);

      expect(mocks.sunatClient.sendBill).toHaveBeenCalledWith(
        expect.any(Buffer), // zipBuffer
        expect.stringContaining('.zip'), // zipFileName
        '20000000001',  // ruc (beta)
        'MODDATOS',     // solUser
        'moddatos',     // solPass
        true,           // isBeta
      );

      // getSolCredentials should NOT be called for beta
      expect(mocks.companies.getSolCredentials).not.toHaveBeenCalled();
    });
  });

  // ── 11. Production credentials ─────────────────────────────────────

  describe('production credentials', () => {
    it('should call getSolCredentials when company.isBeta=false', async () => {
      setupHappyPath(mocks);
      mocks.prisma.client.company.findUnique.mockResolvedValue(
        makeCompany({ isBeta: false, ruc: '20123456789' }),
      );
      mocks.companies.getSolCredentials.mockResolvedValue({
        solUser: 'MIUSUARIO',
        solPass: 'miClave123',
      });

      const job = makeJob();
      await processor.process(job);

      expect(mocks.companies.getSolCredentials).toHaveBeenCalledWith('comp-1');

      expect(mocks.sunatClient.sendBill).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('.zip'),
        '20123456789', // real RUC (not beta)
        'MIUSUARIO',   // from getSolCredentials
        'miClave123',  // from getSolCredentials
        false,         // isBeta=false
      );
    });

    it('should throw when no SOL credentials are configured for production', async () => {
      setupHappyPath(mocks);
      mocks.prisma.client.company.findUnique.mockResolvedValue(
        makeCompany({ isBeta: false }),
      );
      mocks.companies.getSolCredentials.mockResolvedValue(null);

      const job = makeJob();

      await expect(processor.process(job)).rejects.toThrow(
        /No SOL credentials/,
      );

      expect(mocks.sunatClient.sendBill).not.toHaveBeenCalled();
    });
  });

  // ── 12. Post-send pipeline ─────────────────────────────────────────

  describe('post-send pipeline', () => {
    it('should dispatch webhook, queue PDF, and queue email when status=ACCEPTED and email exists', async () => {
      setupHappyPath(mocks);

      const job = makeJob();
      await processor.process(job);

      // Webhook
      expect(mocks.webhooks.notifyInvoiceStatus).toHaveBeenCalledOnce();

      // PDF
      expect(mocks.pdfQueue.add).toHaveBeenCalledOnce();
      expect(mocks.pdfQueue.add).toHaveBeenCalledWith(
        'post-send-pdf',
        expect.objectContaining({ invoiceId: 'inv-001', companyId: 'comp-1' }),
        expect.any(Object),
      );

      // Email
      expect(mocks.emailQueue.add).toHaveBeenCalledOnce();
      expect(mocks.emailQueue.add).toHaveBeenCalledWith(
        'invoice-notification',
        expect.objectContaining({
          to: 'cliente@example.com',
          subject: expect.stringContaining('F001-00000001'),
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: expect.stringContaining('F001-00000001.xml'),
              contentType: 'application/xml',
            }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('should not fail if webhook dispatch throws (error is caught)', async () => {
      setupHappyPath(mocks);
      mocks.webhooks.notifyInvoiceStatus.mockRejectedValue(
        new Error('Webhook timeout'),
      );

      const job = makeJob();

      // Should NOT throw, the error is caught internally
      await expect(processor.process(job)).resolves.toBeUndefined();

      // PDF and email should still be queued
      expect(mocks.pdfQueue.add).toHaveBeenCalledOnce();
      expect(mocks.emailQueue.add).toHaveBeenCalledOnce();
    });

    it('should not fail if PDF queue add throws (error is caught)', async () => {
      setupHappyPath(mocks);
      mocks.pdfQueue.add.mockRejectedValue(new Error('Redis down'));

      const job = makeJob();

      await expect(processor.process(job)).resolves.toBeUndefined();

      // Email should still be attempted
      expect(mocks.emailQueue.add).toHaveBeenCalledOnce();
    });

    it('should not fail if email queue add throws (error is caught)', async () => {
      setupHappyPath(mocks);
      mocks.emailQueue.add.mockRejectedValue(new Error('Redis down'));

      const job = makeJob();

      await expect(processor.process(job)).resolves.toBeUndefined();
    });
  });

  // ── 13. Post-send pipeline — no client email ───────────────────────

  describe('post-send pipeline — no client email', () => {
    it('should NOT queue email when clienteEmail is null', async () => {
      setupHappyPath(mocks);
      mocks.prisma.client.invoice.findFirst.mockResolvedValue(
        makeInvoice({ clienteEmail: null }),
      );

      const job = makeJob();
      await processor.process(job);

      // Webhook and PDF should still happen
      expect(mocks.webhooks.notifyInvoiceStatus).toHaveBeenCalledOnce();
      expect(mocks.pdfQueue.add).toHaveBeenCalledOnce();

      // Email should NOT be queued
      expect(mocks.emailQueue.add).not.toHaveBeenCalled();
    });

    it('should NOT queue email when clienteEmail is empty string', async () => {
      setupHappyPath(mocks);
      mocks.prisma.client.invoice.findFirst.mockResolvedValue(
        makeInvoice({ clienteEmail: '' }),
      );

      const job = makeJob();
      await processor.process(job);

      expect(mocks.emailQueue.add).not.toHaveBeenCalled();
    });
  });

  // ── Company not found ──────────────────────────────────────────────

  describe('company not found', () => {
    it('should throw when the company does not exist', async () => {
      mocks.prisma.client.invoice.findFirst.mockResolvedValue(makeInvoice());
      mocks.prisma.client.invoice.update.mockResolvedValue({});
      mocks.prisma.client.company.findUnique.mockResolvedValue(null);

      const job = makeJob();

      await expect(processor.process(job)).rejects.toThrow(
        /Company comp-1 not found/,
      );
    });
  });
});
