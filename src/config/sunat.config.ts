import { registerAs } from "@nestjs/config";

export default registerAs("sunat", () => ({
  env: (process.env.SUNAT_ENV || "beta") as "beta" | "prod",
  betaUrl:
    process.env.SUNAT_BETA_URL ||
    "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl",
  prodUrl:
    process.env.SUNAT_PROD_URL ||
    "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl",
  /** RUC de pruebas para entorno beta SUNAT */
  betaRuc: process.env.SUNAT_BETA_RUC || "20000000001",
  /** Usuario SOL de pruebas para entorno beta */
  betaUser: process.env.SUNAT_BETA_USER || "MODDATOS",
  /** Clave SOL de pruebas para entorno beta */
  betaPass: process.env.SUNAT_BETA_PASS || "moddatos",

  // ── SOAP timeout ──
  /** SOAP request timeout in milliseconds (default 60s; SUNAT can be slow during peak hours) */
  soapTimeout: parseInt(process.env.SUNAT_SOAP_TIMEOUT || "60000", 10),

  // ── GRE REST API OAuth2 ──
  /** Client ID para la API GRE de SUNAT (proporcionado al registrar en la plataforma API) */
  greClientId: process.env.SUNAT_GRE_CLIENT_ID || "",
  /** Client Secret para la API GRE de SUNAT */
  greClientSecret: process.env.SUNAT_GRE_CLIENT_SECRET || "",
}));
