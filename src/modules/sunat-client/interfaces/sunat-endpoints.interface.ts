/**
 * Set of WSDL endpoints for a given SUNAT environment (beta or production).
 *
 * NOTE: GRE (Guía de Remisión) uses the REST API (see SunatGreClientService),
 * not SOAP, so there is no `guide` endpoint here.
 */
export interface SunatEndpoints {
  /** Main billing service (invoices, boletas, credit/debit notes) */
  invoice: string;

  /** Retention & perception documents */
  retention?: string;

  /** CDR consultation service (production only) */
  consultCdr?: string;

  /** CPE validation service (production only) */
  consultValid?: string;
}
