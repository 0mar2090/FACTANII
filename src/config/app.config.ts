import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'],
  rateLimit: {
    shortTtl: parseInt(process.env.RATE_LIMIT_SHORT_TTL || '1000', 10),
    shortLimit: parseInt(process.env.RATE_LIMIT_SHORT_LIMIT || '3', 10),
    mediumTtl: parseInt(process.env.RATE_LIMIT_MEDIUM_TTL || '10000', 10),
    mediumLimit: parseInt(process.env.RATE_LIMIT_MEDIUM_LIMIT || '20', 10),
    longTtl: parseInt(process.env.RATE_LIMIT_LONG_TTL || '60000', 10),
    longLimit: parseInt(process.env.RATE_LIMIT_LONG_LIMIT || '100', 10),
  },
  uit: parseInt(process.env.UIT_VALUE || '5500', 10),
}));
