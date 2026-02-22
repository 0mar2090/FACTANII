import appConfig from './app.config.js';
import databaseConfig from './database.config.js';
import redisConfig from './redis.config.js';
import jwtConfig from './jwt.config.js';
import sunatConfig from './sunat.config.js';
import mercadopagoConfig from './mercadopago.config.js';
import resendConfig from './resend.config.js';
import sentryConfig from './sentry.config.js';

export {
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  sunatConfig,
  mercadopagoConfig,
  resendConfig,
  sentryConfig,
};

/**
 * Array of all configuration factories for use with ConfigModule.forRoot({ load }).
 *
 * @example
 * ```ts
 * import { allConfigs } from './config/index.js';
 *
 * ConfigModule.forRoot({
 *   isGlobal: true,
 *   load: allConfigs,
 * });
 * ```
 */
export const allConfigs = [
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  sunatConfig,
  mercadopagoConfig,
  resendConfig,
  sentryConfig,
];
