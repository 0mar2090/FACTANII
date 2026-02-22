import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!refreshSecret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is required');
  }

  return {
    secret,
    expiration: process.env.JWT_EXPIRATION || '15m',
    refreshSecret,
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  };
});
