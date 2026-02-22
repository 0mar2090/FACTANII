/**
 * Set of WSDL endpoints for a given SUNAT environment (beta or production).
 */
export interface SunatEndpoints {
  /** Main billing service (invoices, boletas, credit/debit notes) */
  invoice: string;

  /** Retention & perception documents */
  retention?: string;

  /** Transport guides (guias de remision) */
  guide?: string;

  /** CDR consultation service (production only) */
  consultCdr?: string;

  /** CPE validation service (production only) */
  consultValid?: string;
}
