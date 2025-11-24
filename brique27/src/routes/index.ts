import { Router } from 'express';
import { prefsRouter } from './prefs';
import { testRouter } from './test';
import { dispatchRouter } from './dispatch';
import { outboxRouter } from './outbox';
import { routingAdminRouter } from './routingAdmin';

export const apiRouter = Router();

apiRouter.use('/notifications/prefs', prefsRouter);
apiRouter.use('/notifications/test', testRouter);
apiRouter.use('/notifications/dispatch', dispatchRouter);
apiRouter.use('/notifications/outbox', outboxRouter);
apiRouter.use('/admin/routing', routingAdminRouter);