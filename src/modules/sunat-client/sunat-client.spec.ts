import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SUNAT_ENDPOINTS } from '../../common/constants/index.js';

// ---------------------------------------------------------------------------
// Mock the `soap` module before importing the service (ESM hoisting)
// vi.hoisted() ensures the variable is available when vi.mock factories run
// ---------------------------------------------------------------------------

const { mockSoapClient } = vi.hoisted(() => {
  const mockSoapClient = {
    sendBillAsync: vi.fn(),
    sendSummaryAsync: vi.fn(),
    getStatusAsync: vi.fn(),
    getStatusCdrAsync: vi.fn(),
    validaCDPcriteriosAsync: vi.fn(),
    setSecurity: vi.fn(),
    setEndpoint: vi.fn(),
  };
  return { mockSoapClient };
});

vi.mock('soap', () => ({
  default: {
    createClientAsync: vi.fn().mockResolvedValue(mockSoapClient),
    WSSecurity: vi.fn(),
  },
  createClientAsync: vi.fn().mockResolvedValue(mockSoapClient),
  WSSecurity: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
      },
    })),
  },
}));

// ---------------------------------------------------------------------------
// Import service after mocks are registered
// ---------------------------------------------------------------------------

import { SunatClientService } from './sunat-client.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockConfigService() {
  return {
    get: vi.fn((key: string, defaultValue?: unknown) => {
      if (key === 'sunat.soapTimeout') return 60000;
      return defaultValue;
    }),
  } as any;
}

/** Build a fake CDR ZIP as a base64 string (just enough bytes to be non-empty). */
function fakeCdrBase64(): string {
  return Buffer.from('<CDR>accepted</CDR>').toString('base64');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SunatClientService', () => {
  let service: SunatClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SunatClientService(createMockConfigService());
  });

  // ─────────────────────────────────────────────
  // sendBill
  // ─────────────────────────────────────────────

  describe('sendBill', () => {
    const zipBuffer = Buffer.from('fake-zip-content');
    const zipFileName = '20000000001-01-F001-00000001.zip';
    const ruc = '20000000001';
    const solUser = 'MODDATOS';
    const solPass = 'moddatos';

    it('should return success with CDR when SUNAT responds with applicationResponse', async () => {
      const cdrBase64 = fakeCdrBase64();

      mockSoapClient.sendBillAsync.mockResolvedValueOnce([
        { applicationResponse: cdrBase64 },
      ]);

      const result = await service.sendBill(
        zipBuffer,
        zipFileName,
        ruc,
        solUser,
        solPass,
        true, // isBeta
      );

      expect(result.success).toBe(true);
      expect(result.code).toBe('0');
      expect(result.message).toBe('CDR received from SUNAT');
      expect(result.cdrZip).toBeDefined();
      expect(result.cdrZip).toBeInstanceOf(Buffer);
      expect(result.cdrZip!.length).toBeGreaterThan(0);

      // Verify the CDR bytes match what we base64-encoded
      expect(result.cdrZip!.toString()).toBe('<CDR>accepted</CDR>');
    });

    it('should return success=false when SUNAT responds without applicationResponse', async () => {
      mockSoapClient.sendBillAsync.mockResolvedValueOnce([{}]);

      const result = await service.sendBill(
        zipBuffer,
        zipFileName,
        ruc,
        solUser,
        solPass,
        true,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('No applicationResponse');
    });

    it('should handle SOAP faults and extract faultcode/faultstring', async () => {
      const soapFault = {
        root: {
          Envelope: {
            Body: {
              Fault: {
                faultcode: 'soap-env:Client.2800',
                faultstring: 'El comprobante fue registrado previamente',
                detail: {
                  code: '2800',
                  message: 'El comprobante fue registrado previamente con otros datos',
                },
              },
            },
          },
        },
      };

      mockSoapClient.sendBillAsync.mockRejectedValueOnce(soapFault);

      const result = await service.sendBill(
        zipBuffer,
        zipFileName,
        ruc,
        solUser,
        solPass,
        true,
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('2800');
      expect(result.rawFaultCode).toBe('soap-env:Client.2800');
      expect(result.rawFaultString).toBe('El comprobante fue registrado previamente');
      expect(result.message).toContain('registrado previamente');
    });

    it('should handle generic (non-SOAP) errors gracefully', async () => {
      mockSoapClient.sendBillAsync.mockRejectedValueOnce(
        new Error('ECONNREFUSED'),
      );

      const result = await service.sendBill(
        zipBuffer,
        zipFileName,
        ruc,
        solUser,
        solPass,
        true,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('ECONNREFUSED');
    });
  });

  // ─────────────────────────────────────────────
  // sendSummary
  // ─────────────────────────────────────────────

  describe('sendSummary', () => {
    const zipBuffer = Buffer.from('fake-summary-zip');
    const zipFileName = '20000000001-RC-20260223-001.zip';
    const ruc = '20000000001';
    const solUser = 'MODDATOS';
    const solPass = 'moddatos';

    it('should return success with ticket when SUNAT responds', async () => {
      mockSoapClient.sendSummaryAsync.mockResolvedValueOnce([
        { ticket: '1708123456789' },
      ]);

      const result = await service.sendSummary(
        zipBuffer,
        zipFileName,
        ruc,
        solUser,
        solPass,
        true,
      );

      expect(result.success).toBe(true);
      expect(result.ticket).toBe('1708123456789');
      expect(result.message).toContain('Ticket received');
    });

    it('should return success=false when no ticket is returned', async () => {
      mockSoapClient.sendSummaryAsync.mockResolvedValueOnce([{}]);

      const result = await service.sendSummary(
        zipBuffer,
        zipFileName,
        ruc,
        solUser,
        solPass,
        true,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('No ticket');
    });

    it('should handle SOAP faults in sendSummary', async () => {
      const soapFault = {
        root: {
          Envelope: {
            Body: {
              Fault: {
                faultcode: 'soap-env:Server',
                faultstring: 'Error interno del servidor',
              },
            },
          },
        },
      };

      mockSoapClient.sendSummaryAsync.mockRejectedValueOnce(soapFault);

      const result = await service.sendSummary(
        zipBuffer,
        zipFileName,
        ruc,
        solUser,
        solPass,
        true,
      );

      expect(result.success).toBe(false);
      expect(result.rawFaultCode).toBe('soap-env:Server');
      expect(result.rawFaultString).toBe('Error interno del servidor');
    });
  });

  // ─────────────────────────────────────────────
  // getStatus
  // ─────────────────────────────────────────────

  describe('getStatus', () => {
    const ticket = '1708123456789';
    const ruc = '20000000001';
    const solUser = 'MODDATOS';
    const solPass = 'moddatos';

    it('should return CDR when status code is 99 (processing complete)', async () => {
      const cdrBase64 = fakeCdrBase64();

      mockSoapClient.getStatusAsync.mockResolvedValueOnce([
        {
          status: {
            statusCode: 99,
            content: cdrBase64,
          },
        },
      ]);

      const result = await service.getStatus(ticket, ruc, solUser, solPass, true);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe('99');
      expect(result.code).toBe('0');
      expect(result.cdrZip).toBeInstanceOf(Buffer);
      expect(result.cdrZip!.toString()).toBe('<CDR>accepted</CDR>');
      expect(result.message).toContain('complete');
    });

    it('should indicate still processing when status code is 98', async () => {
      mockSoapClient.getStatusAsync.mockResolvedValueOnce([
        {
          status: {
            statusCode: 98,
          },
        },
      ]);

      const result = await service.getStatus(ticket, ruc, solUser, solPass, true);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe('98');
      expect(result.cdrZip).toBeUndefined();
      expect(result.message).toContain('still processing');
    });

    it('should indicate pending when status code is 0', async () => {
      mockSoapClient.getStatusAsync.mockResolvedValueOnce([
        {
          status: {
            statusCode: 0,
          },
        },
      ]);

      const result = await service.getStatus(ticket, ruc, solUser, solPass, true);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe('0');
      expect(result.cdrZip).toBeUndefined();
      expect(result.message).toContain('pending');
    });

    it('should return success=false for unexpected status codes', async () => {
      mockSoapClient.getStatusAsync.mockResolvedValueOnce([
        {
          status: {
            statusCode: 42,
          },
        },
      ]);

      const result = await service.getStatus(ticket, ruc, solUser, solPass, true);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe('42');
      expect(result.message).toContain('Unexpected status code');
    });

    it('should return success=false when no status response is returned', async () => {
      mockSoapClient.getStatusAsync.mockResolvedValueOnce([{}]);

      const result = await service.getStatus(ticket, ruc, solUser, solPass, true);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No status response');
    });

    it('should handle SOAP faults in getStatus', async () => {
      const soapFault = {
        root: {
          Envelope: {
            Body: {
              Fault: {
                faultcode: 'soap-env:Client',
                faultstring: 'Ticket no encontrado',
              },
            },
          },
        },
      };

      mockSoapClient.getStatusAsync.mockRejectedValueOnce(soapFault);

      const result = await service.getStatus(ticket, ruc, solUser, solPass, true);

      expect(result.success).toBe(false);
      expect(result.code).toBe('soap-env:Client');
      expect(result.message).toBe('Ticket no encontrado');
    });
  });

  // ─────────────────────────────────────────────
  // consultCdr
  // ─────────────────────────────────────────────

  describe('consultCdr', () => {
    const ruc = '20000000001';
    const solUser = 'MODDATOS';
    const solPass = 'moddatos';

    it('should return failure for beta environment (no consult endpoint)', async () => {
      const result = await service.consultCdr(
        ruc,
        '01',
        'F001',
        1,
        solUser,
        solPass,
        true, // isBeta — no consultCdr endpoint available
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('only available in production');

      // Should NOT have attempted any SOAP call
      expect(mockSoapClient.getStatusCdrAsync).not.toHaveBeenCalled();
    });

    it('should return CDR when production endpoint responds with content', async () => {
      const cdrBase64 = fakeCdrBase64();

      mockSoapClient.getStatusCdrAsync.mockResolvedValueOnce([
        {
          statusCdr: {
            statusCode: 0,
            statusMessage: 'La consulta se realizo exitosamente',
            content: cdrBase64,
          },
        },
      ]);

      const result = await service.consultCdr(
        ruc,
        '01',
        'F001',
        1,
        solUser,
        solPass,
        false, // production
      );

      expect(result.success).toBe(true);
      expect(result.cdrZip).toBeInstanceOf(Buffer);
      expect(result.cdrZip!.toString()).toBe('<CDR>accepted</CDR>');
      expect(result.code).toBe('0');
      expect(result.message).toContain('exitosamente');
    });

    it('should return failure when production endpoint returns no CDR content', async () => {
      mockSoapClient.getStatusCdrAsync.mockResolvedValueOnce([
        {
          statusCdr: {
            statusCode: 1,
            statusMessage: 'El comprobante no existe',
          },
        },
      ]);

      const result = await service.consultCdr(
        ruc,
        '01',
        'F001',
        999999,
        solUser,
        solPass,
        false,
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('1');
      expect(result.message).toContain('no existe');
    });
  });

  // ─────────────────────────────────────────────
  // validateCpe
  // ─────────────────────────────────────────────

  describe('validateCpe', () => {
    it('should return valid=true when SUNAT responds with statusCode 0', async () => {
      mockSoapClient.validaCDPcriteriosAsync.mockResolvedValueOnce([
        {
          statusCode: '0',
          statusMessage: 'El comprobante existe y es valido',
        },
      ]);

      // validateCpe uses soap.createClientAsync directly (no WSSecurity)
      const soap = await import('soap');
      (soap.createClientAsync as any).mockResolvedValueOnce(mockSoapClient);

      const result = await service.validateCpe(
        '20000000001',
        '01',
        'F001',
        1,
        '2026-01-15',
        118.0,
      );

      expect(result.valid).toBe(true);
      expect(result.message).toContain('valido');
    });

    it('should return valid=false when SUNAT responds with non-zero statusCode', async () => {
      mockSoapClient.validaCDPcriteriosAsync.mockResolvedValueOnce([
        {
          statusCode: '1',
          statusMessage: 'El comprobante no existe',
        },
      ]);

      const soap = await import('soap');
      (soap.createClientAsync as any).mockResolvedValueOnce(mockSoapClient);

      const result = await service.validateCpe(
        '20000000001',
        '01',
        'F001',
        999,
        '2026-01-15',
        100.0,
      );

      expect(result.valid).toBe(false);
      expect(result.message).toContain('no existe');
    });

    it('should handle errors gracefully and return valid=false', async () => {
      const soap = await import('soap');
      (soap.createClientAsync as any).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const result = await service.validateCpe(
        '20000000001',
        '01',
        'F001',
        1,
        '2026-01-15',
        118.0,
      );

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Network error');
    });
  });

  // ─────────────────────────────────────────────
  // Endpoint resolution (beta vs production, invoice vs retention)
  // ─────────────────────────────────────────────

  describe('endpoint resolution', () => {
    const zipBuffer = Buffer.from('test-zip');
    const ruc = '20000000001';
    const solUser = 'MODDATOS';
    const solPass = 'moddatos';

    it('should use beta invoice endpoint when isBeta=true and endpointType=invoice', async () => {
      mockSoapClient.sendBillAsync.mockResolvedValueOnce([
        { applicationResponse: fakeCdrBase64() },
      ]);

      await service.sendBill(
        zipBuffer,
        '20000000001-01-F001-1.zip',
        ruc,
        solUser,
        solPass,
        true,   // isBeta
        'invoice',
      );

      // The service calls setEndpoint with the WSDL URL minus "?wsdl"
      expect(mockSoapClient.setEndpoint).toHaveBeenCalledWith(
        SUNAT_ENDPOINTS.BETA.INVOICE.replace('?wsdl', ''),
      );
    });

    it('should use beta retention endpoint when isBeta=true and endpointType=retention', async () => {
      mockSoapClient.sendBillAsync.mockResolvedValueOnce([
        { applicationResponse: fakeCdrBase64() },
      ]);

      await service.sendBill(
        zipBuffer,
        '20000000001-20-R001-1.zip',
        ruc,
        solUser,
        solPass,
        true,   // isBeta
        'retention',
      );

      expect(mockSoapClient.setEndpoint).toHaveBeenCalledWith(
        SUNAT_ENDPOINTS.BETA.RETENTION.replace('?wsdl', ''),
      );
    });

    it('should use production invoice endpoint when isBeta=false', async () => {
      mockSoapClient.sendBillAsync.mockResolvedValueOnce([
        { applicationResponse: fakeCdrBase64() },
      ]);

      await service.sendBill(
        zipBuffer,
        '20000000001-01-F001-1.zip',
        ruc,
        solUser,
        solPass,
        false,  // production
        'invoice',
      );

      expect(mockSoapClient.setEndpoint).toHaveBeenCalledWith(
        SUNAT_ENDPOINTS.PRODUCTION.INVOICE.replace('?wsdl', ''),
      );
    });

    it('should use production retention endpoint when isBeta=false and endpointType=retention', async () => {
      mockSoapClient.sendBillAsync.mockResolvedValueOnce([
        { applicationResponse: fakeCdrBase64() },
      ]);

      await service.sendBill(
        zipBuffer,
        '20000000001-20-R001-1.zip',
        ruc,
        solUser,
        solPass,
        false,  // production
        'retention',
      );

      expect(mockSoapClient.setEndpoint).toHaveBeenCalledWith(
        SUNAT_ENDPOINTS.PRODUCTION.RETENTION.replace('?wsdl', ''),
      );
    });

    it('should default endpointType to invoice when not specified', async () => {
      mockSoapClient.sendBillAsync.mockResolvedValueOnce([
        { applicationResponse: fakeCdrBase64() },
      ]);

      await service.sendBill(
        zipBuffer,
        '20000000001-01-F001-1.zip',
        ruc,
        solUser,
        solPass,
        true,
        // endpointType omitted — should default to 'invoice'
      );

      expect(mockSoapClient.setEndpoint).toHaveBeenCalledWith(
        SUNAT_ENDPOINTS.BETA.INVOICE.replace('?wsdl', ''),
      );
    });

    it('should concatenate RUC+SOLUser for SOAP credentials', async () => {
      const { WSSecurity } = await import('soap');

      mockSoapClient.sendBillAsync.mockResolvedValueOnce([
        { applicationResponse: fakeCdrBase64() },
      ]);

      await service.sendBill(
        zipBuffer,
        '20000000001-01-F001-1.zip',
        '20123456789',
        'USUARIO1',
        'clave123',
        true,
      );

      // WSSecurity should have been called with "20123456789USUARIO1" as username + timestamp option
      expect(WSSecurity).toHaveBeenCalledWith('20123456789USUARIO1', 'clave123', { hasTimeStamp: true });
    });
  });
});
