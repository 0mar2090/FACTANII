import { registerAs } from '@nestjs/config';

export default registerAs('mercadopago', () => ({
  accessToken: process.env.MP_ACCESS_TOKEN || '',
  webhookSecret: process.env.MP_WEBHOOK_SECRET || '',
}));
