import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

export async function verifyJWT(req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization;
    if (!header) {
        return reply.code(401).send({ error: 'NO_AUTH' });
    }

    const token = header.replace(/^Bearer\s+/i, '');

    try {
        const payload = jwt.verify(
            token,
            process.env.SERVICE_JWT_PUBLIC as string,
            { algorithms: ['RS256'] }
        ) as any;

        (req as any).user = payload;
    } catch (error: any) {
        return reply.code(401).send({ error: 'BAD_TOKEN', message: error.message });
    }
}