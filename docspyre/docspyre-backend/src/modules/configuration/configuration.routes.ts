import { Router } from 'express';
import { configurationController } from './configuration.controller';
import { authenticate } from '../../middleware';

/** Exposes AI provider configuration endpoints under auth. */
const router: Router = Router();

router.use(authenticate);

router.get('/', configurationController.list);
router.post('/', configurationController.create);
router.put('/:id', configurationController.update);
router.delete('/:id', configurationController.delete);

export { router as configurationRoutes };
