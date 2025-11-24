import { RateLimiterPostgres } from 'rate-limiter-flexible';
import { pool } from '../store/db';

export const rateLimiter = new RateLimiterPostgres({
    storeClient: pool,
    tableName: 'rate_limits',
    points: 10, // Number of points
    duration: 1, // Per second
    blockDuration: 60, // Block for 60 seconds if exceeded
});

export const rateLimitMiddleware = (req: any, res: any, next: any) => {
    rateLimiter.consume(req.ip)
        .then(() => {
            next();
        })
        .catch(() => {
            res.status(429).send('Too Many Requests');
        });
};