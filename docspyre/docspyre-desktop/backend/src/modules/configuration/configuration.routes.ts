import { Router } from 'express';
import { configurationController } from './configuration.controller';
import { authenticate } from '../../core/middleware';

const router: Router = Router();
router.use(authenticate);

router.get('/', configurationController.list);
router.post('/', configurationController.create);
router.put('/:id', configurationController.update);
router.delete('/:id', configurationController.remove);

export { router as configurationRoutes };
