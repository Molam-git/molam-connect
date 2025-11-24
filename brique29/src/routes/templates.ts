import { Router } from 'express';
import { TemplatesController } from '../controllers/templatesController';
import { requireRole } from '../middleware/authz';

export const templatesRouter = Router();

// Public route - template rendering
templatesRouter.get('/:key/render', TemplatesController.renderTemplate);

// Protected routes - require admin roles
templatesRouter.get('/', TemplatesController.listTemplates);
templatesRouter.post('/', requireRole(['notif_admin', 'pay_admin']), TemplatesController.createTemplate);
templatesRouter.post('/:id/activate', requireRole(['notif_admin', 'pay_admin']), TemplatesController.activateTemplate);

export default templatesRouter;