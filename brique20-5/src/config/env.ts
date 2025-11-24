export const config = {
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    kafkaBrokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
    jwtSecret: process.env.JWT_SECRET!,
    nodeEnv: process.env.NODE_ENV || 'development',
    p2pReversibleWindowSec: parseInt(process.env.P2P_REVERSIBLE_WINDOW_SEC || '300'),
    port: parseInt(process.env.PORT || '3000'),
};

// Validation
for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === null) {
        throw new Error(`Missing environment variable: ${key}`);
    }
}