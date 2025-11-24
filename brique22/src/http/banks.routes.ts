import { quote, execute } from '../services/bankInteropService';
import { bankWebhook } from './bankWebhooks';
import { authMiddleware } from '../utils/auth';
import { rateLimit } from '../utils/ratelimit';
import { QuoteRequest, ExecuteRequest } from '../contracts/banks.dto';

export default function register(app: any) {
    app.get('/api/pay/banks/routes', authMiddleware('wallet:bank:quote'), async (req: any, res: any) => {
        try {
            const quoteRequest: QuoteRequest = {
                direction: req.query.direction,
                amount: Number(req.query.amount),
                currency: req.query.currency,
                fromCountry: req.query.fromCountry,
                toCountry: req.query.toCountry,
                bankCode: req.query.bankCode
            };
            const q = await quote(quoteRequest);
            res.json(q);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    });

    app.post('/api/pay/banks/execute', authMiddleware('wallet:bank:execute'), rateLimit(), async (req: any, res: any) => {
        try {
            const executeRequest: ExecuteRequest = {
                quote: req.body.quote,
                userId: req.user.id,
                walletId: req.body.walletId,
                beneficiary: req.body.beneficiary
            };
            const e = await execute(executeRequest);
            res.status(202).json(e);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    });

    app.post('/api/pay/banks/webhook/:bankCode', bankWebhook); // mTLS at LB + HMAC
}