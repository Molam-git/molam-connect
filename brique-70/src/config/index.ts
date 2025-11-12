import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '8083', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/molam_marketing',
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-jwt-secret-here',
    molamIdPublicKeyUrl: process.env.MOLAM_ID_PUBLIC_KEY_URL || 'https://id.molam.io/.well-known/jwks.json',
  },
  subscriptions: {
    checkInterval: parseInt(process.env.SUBSCRIPTION_CHECK_INTERVAL || '3600000', 10),
    gracePeriodDays: parseInt(process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS || '3', 10),
  },
  sira: {
    enabled: process.env.SIRA_ENABLED === 'true',
    apiUrl: process.env.SIRA_API_URL || 'http://localhost:8084',
  },
  marketing: {
    promoCodeMaxUsage: parseInt(process.env.PROMO_CODE_MAX_USAGE || '1000', 10),
  },
};
