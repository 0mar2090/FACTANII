import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);

function makeCompany() {
  return {
    id: 'comp1',
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
    serieNCFactura: 'FC01',
    serieNDFactura: 'FD01',
    serieNCBoleta: 'BC01',
    serieNDBoleta: 'BD01',
    serieRetencion: 'R001',
    seriePercepcion: 'P001',
    serieGuiaRemision: 'T001',
    nextCorrelativo: {},
    isActive: true,
    nombreComercial: null,
    urbanizacion: null,
    solUser: null,
    solPass: null,
    solIv: null,
    solTag: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeCert() {
  return {
    pfxBuffer: Buffer.from('fake-pfx'),
    passphrase: '12345678',
    info: {
      serialNumber: '001',
      issuer: 'Test CA',
      subject: 'Test Subject',
      validFrom: new Date('2025-01-01'),
      validTo: new Date('2027-01-01'),
    },
  };
}

function makeInvoiceDto() {
  return {
    tipoDoc: '01',
    fechaEmision: today,
    clienteTipoDoc: '6',
    clienteNumDoc: '20100000001',
    clienteNombre: 'EMPRESA SRL',
    clienteDireccion: 'Av. Test 123',
    items: [
      {
        cantidad: 2,
        valorUnitario: 100,
        descripcion: 'Producto de prueba',
        tipoAfectacion: '10',
      },
    ],
  } as any;
}

function makeSavedInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-001',
    companyId: 'comp1',
    tipoDoc: '01',
    serie: 'F001',
    correlativo: 1,
    tipoOperacion: '0101',
    fechaEmision: new Date(today),
    fechaVencimiento: null,
    clienteTipoDoc: '6',
    clienteNumDoc: '20100000001',
    clienteNombre: 'EMPRESA SRL',
    clienteDireccion: 'Av. Test 123',
    clienteEmail: null,
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
    status: 'ACCEPTED',
    sunatCode: '0',
    sunatMessage: 'La Factura numero F001-00000001, ha sido aceptada',
    sunatNotes: null,
    cdrZip: null,
    pdfUrl: null,
    sentAt: new Date(),
    attempts: 1,
    lastAttemptAt: new Date(),
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Mock Factories ───────────────────────────────────────────────────────────

function createMocks() {
  const prisma = {
    client: {
      company: {
        findUnique: vi.fn(),
      },
      invoice: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      $queryRawUnsafe: vi.fn(),
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

  const sunatGreClient = {
    sendGuide: vi.fn(),
    getGuideStatus: vi.fn(),
    anularGuia: vi.fn(),
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

  const xmlValidator = {
    validateInvoice: vi.fn(),
    validateCreditNote: vi.fn(),
    validateDebitNote: vi.fn(),
    validateSummary: vi.fn(),
    validateVoided: vi.fn(),
    validateRetention: vi.fn(),
    validatePerception: vi.fn(),
    validateGuide: vi.fn(),
  };

  const pdfGenerator = {
    generateA4: vi.fn(),
    generateTicket: vi.fn(),
  };

  const billing = {
    checkQuota: vi.fn(),
    incrementInvoiceCount: vi.fn(),
  };

  const invoiceSendQueue = { add: vi.fn() };
  const ticketPollQueue = { add: vi.fn() };

  return {
    prisma,
    xmlBuilder,
    xmlSigner,
    sunatClient,
    sunatGreClient,
    cdrProcessor,
    certificates,
    companies,
    xmlValidator,
    pdfGenerator,
    billing,
    invoiceSendQueue,
    ticketPollQueue,
  };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new InvoicesService(
    mocks.prisma as any,
    mocks.xmlBuilder as any,
    mocks.xmlSigner as any,
    mocks.sunatClient as any,
    mocks.sunatGreClient as any,
    mocks.cdrProcessor as any,
    mocks.certificates as any,
    mocks.companies as any,
    mocks.xmlValidator as any,
    mocks.pdfGenerator as any,
    mocks.billing as any,
    mocks.invoiceSendQueue as any,
    mocks.ticketPollQueue as any,
  );
}

// ── Setup for happy-path mocks ───────────────────────────────────────────────

function setupHappyPath(mocks: ReturnType<typeof createMocks>) {
  // xmlValidator.validateInvoice — no-op (does not throw)
  mocks.xmlValidator.validateInvoice.mockImplementation(() => {});

  // billing.checkQuota → allowed
  mocks.billing.checkQuota.mockResolvedValue({ allowed: true, used: 5, max: 100 });
  mocks.billing.incrementInvoiceCount.mockResolvedValue(undefined);

  // prisma.client.company.findUnique → company
  mocks.prisma.client.company.findUnique.mockResolvedValue(makeCompany());

  // certificates.getActiveCertificate → cert
  mocks.certificates.getActiveCertificate.mockResolvedValue(makeCert());

  // companies.getSolCredentials → sol creds
  mocks.companies.getSolCredentials.mockResolvedValue({
    solUser: 'MODDATOS',
    solPass: 'moddatos',
  });

  // Atomic correlativo increment
  mocks.prisma.client.$queryRawUnsafe.mockResolvedValue([
    { next_correlativo: { F001: 1 } },
  ]);

  // XML build + sign
  mocks.xmlBuilder.buildInvoice.mockReturnValue('<xml/>');
  mocks.xmlSigner.sign.mockReturnValue('<signedXml/>');
  mocks.xmlSigner.getXmlHash.mockReturnValue('abc123');

  // SUNAT send → success with CDR
  mocks.sunatClient.sendBill.mockResolvedValue({
    success: true,
    cdrZip: Buffer.from('fake-cdr-zip'),
  });

  // CDR processor → accepted
  mocks.cdrProcessor.processCdr.mockReturnValue({
    responseCode: '0',
    description: 'La Factura numero F001-00000001, ha sido aceptada',
    isAccepted: true,
    hasObservations: false,
    notes: [],
  });

  // prisma.client.invoice.create → saved invoice
  mocks.prisma.client.invoice.create.mockResolvedValue(makeSavedInvoice());
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('InvoicesService', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: InvoicesService;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
  });

  // ── createInvoice: happy path ──────────────────────────────────────────

  describe('createInvoice — happy path', () => {
    beforeEach(() => {
      setupHappyPath(mocks);
    });

    it('should return a valid InvoiceResponseDto for an accepted factura', async () => {
      const dto = makeInvoiceDto();
      const result = await service.createInvoice('comp1', dto);

      // Verify returned DTO shape and values
      expect(result).toBeDefined();
      expect(result.id).toBe('inv-001');
      expect(result.tipoDoc).toBe('01');
      expect(result.serie).toBe('F001');
      expect(result.correlativo).toBe(1);
      expect(result.fechaEmision).toBe(today);
      expect(result.clienteNombre).toBe('EMPRESA SRL');
      expect(result.clienteNumDoc).toBe('20100000001');
      expect(result.moneda).toBe('PEN');
      expect(result.totalVenta).toBe(236);
      expect(result.status).toBe('ACCEPTED');
      expect(result.sunatCode).toBe('0');
      expect(result.sunatMessage).toContain('aceptada');
      expect(result.createdAt).toBeDefined();
    });

    it('should call xmlValidator.validateInvoice with the dto', async () => {
      const dto = makeInvoiceDto();
      await service.createInvoice('comp1', dto);

      expect(mocks.xmlValidator.validateInvoice).toHaveBeenCalledOnce();
      expect(mocks.xmlValidator.validateInvoice).toHaveBeenCalledWith(dto);
    });

    it('should call billing.checkQuota before processing', async () => {
      const dto = makeInvoiceDto();
      await service.createInvoice('comp1', dto);

      expect(mocks.billing.checkQuota).toHaveBeenCalledWith('comp1');
    });

    it('should call xmlBuilder.buildInvoice', async () => {
      const dto = makeInvoiceDto();
      await service.createInvoice('comp1', dto);

      expect(mocks.xmlBuilder.buildInvoice).toHaveBeenCalledOnce();
      const invoiceData = mocks.xmlBuilder.buildInvoice.mock.calls[0][0];
      expect(invoiceData.tipoDoc).toBe('01');
      expect(invoiceData.serie).toBe('F001');
      expect(invoiceData.correlativo).toBe(1);
      expect(invoiceData.moneda).toBe('PEN');
      expect(invoiceData.items).toHaveLength(1);
    });

    it('should call xmlSigner.sign with the built xml and certificate', async () => {
      const dto = makeInvoiceDto();
      await service.createInvoice('comp1', dto);

      expect(mocks.xmlSigner.sign).toHaveBeenCalledOnce();
      const [xml, pfxBuf, passphrase] = mocks.xmlSigner.sign.mock.calls[0];
      expect(xml).toBe('<xml/>');
      expect(pfxBuf).toBeInstanceOf(Buffer);
      expect(passphrase).toBe('12345678');
    });

    it('should send the signed XML to SUNAT via sendBill', async () => {
      const dto = makeInvoiceDto();
      await service.createInvoice('comp1', dto);

      expect(mocks.sunatClient.sendBill).toHaveBeenCalledOnce();
      const args = mocks.sunatClient.sendBill.mock.calls[0];
      // args: zipBuffer, zipFileName, ruc, solUser, solPass, isBeta, endpointType
      expect(args[2]).toBe('20000000001'); // ruc (beta)
      expect(args[3]).toBe('MODDATOS');    // solUser (beta)
      expect(args[4]).toBe('moddatos');    // solPass (beta)
      expect(args[5]).toBe(true);          // isBeta
      expect(args[6]).toBe('invoice');     // endpointType
    });

    it('should call cdrProcessor.processCdr with the CDR zip', async () => {
      const dto = makeInvoiceDto();
      await service.createInvoice('comp1', dto);

      expect(mocks.cdrProcessor.processCdr).toHaveBeenCalledOnce();
    });

    it('should save the invoice to the database', async () => {
      const dto = makeInvoiceDto();
      await service.createInvoice('comp1', dto);

      expect(mocks.prisma.client.invoice.create).toHaveBeenCalledOnce();
      const createArg = mocks.prisma.client.invoice.create.mock.calls[0][0];
      expect(createArg.data.companyId).toBe('comp1');
      expect(createArg.data.tipoDoc).toBe('01');
      expect(createArg.data.serie).toBe('F001');
      expect(createArg.data.correlativo).toBe(1);
      expect(createArg.data.xmlSigned).toBe(true);
      expect(createArg.data.status).toBe('ACCEPTED');
      expect(createArg.data.xmlContent).toBe('<signedXml/>');
      expect(createArg.data.xmlHash).toBe('abc123');
      expect(createArg.data.items.create).toHaveLength(1);
    });

    it('should fire billing.incrementInvoiceCount after saving', async () => {
      const dto = makeInvoiceDto();
      await service.createInvoice('comp1', dto);

      expect(mocks.billing.incrementInvoiceCount).toHaveBeenCalledWith('comp1');
    });
  });

  // ── createInvoice: validation error ────────────────────────────────────

  describe('createInvoice — validation error', () => {
    it('should throw BadRequestException when xmlValidator.validateInvoice throws', async () => {
      mocks.xmlValidator.validateInvoice.mockImplementation(() => {
        throw new BadRequestException('Factura (01) requires RUC');
      });

      const dto = makeInvoiceDto();

      await expect(service.createInvoice('comp1', dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createInvoice('comp1', dto)).rejects.toThrow(
        'Factura (01) requires RUC',
      );

      // None of the downstream services should have been called
      expect(mocks.billing.checkQuota).not.toHaveBeenCalled();
      expect(mocks.xmlBuilder.buildInvoice).not.toHaveBeenCalled();
      expect(mocks.sunatClient.sendBill).not.toHaveBeenCalled();
      expect(mocks.prisma.client.invoice.create).not.toHaveBeenCalled();
    });
  });

  // ── createInvoice: quota exceeded ──────────────────────────────────────

  describe('createInvoice — quota exceeded', () => {
    it('should throw BadRequestException when billing quota is exceeded', async () => {
      // Validator passes
      mocks.xmlValidator.validateInvoice.mockImplementation(() => {});

      // Quota denied
      mocks.billing.checkQuota.mockResolvedValue({
        allowed: false,
        used: 100,
        max: 100,
      });

      const dto = makeInvoiceDto();

      await expect(service.createInvoice('comp1', dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createInvoice('comp1', dto)).rejects.toThrow(
        /quota exceeded/i,
      );

      // XML build and SUNAT send should NOT have been called
      expect(mocks.xmlBuilder.buildInvoice).not.toHaveBeenCalled();
      expect(mocks.sunatClient.sendBill).not.toHaveBeenCalled();
      expect(mocks.prisma.client.invoice.create).not.toHaveBeenCalled();
    });
  });
});
