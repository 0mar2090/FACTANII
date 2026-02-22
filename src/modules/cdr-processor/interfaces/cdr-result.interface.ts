export interface CdrResult {
  /** Response code from SUNAT. "0" means accepted. */
  responseCode: string;
  /** Human-readable description from SUNAT */
  description: string;
  /** Warning/observation notes (non-fatal) */
  notes: string[];
  /** Whether the document was accepted (code "0" or starts with "0") */
  isAccepted: boolean;
  /** Whether the document has observations (accepted with warnings) */
  hasObservations: boolean;
  /** The raw CDR XML content */
  rawXml: string;
}
