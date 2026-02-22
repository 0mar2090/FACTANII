import { registerAs } from '@nestjs/config';

export default registerAs('sunat', () => ({
  env: (process.env.SUNAT_ENV || 'beta') as 'beta' | 'prod',
  betaUrl:
    process.env.SUNAT_BETA_URL ||
    'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl',
  prodUrl:
    process.env.SUNAT_PROD_URL ||
    'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl',
  /** RUC de pruebas para entorno beta SUNAT */
  betaRuc: process.env.SUNAT_BETA_RUC || '20000000001',
  /** Usuario SOL de pruebas para entorno beta */
  betaUser: process.env.SUNAT_BETA_USER || 'MODDATOS',
  /** Clave SOL de pruebas para entorno beta */
  betaPass: process.env.SUNAT_BETA_PASS || 'MODDATOS',
}));
