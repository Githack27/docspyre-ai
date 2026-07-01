import { Router } from 'express';
import { usersController } from './users.controller';
import { userSearchSchema } from './users.validation';
import { authenticate, validate } from '../../middleware';

/** User-facing lookups. Currently the registered-member search. */
const router: Router = Router();

router.use(authenticate);

router.get('/search', validate({ query: userSearchSchema }), usersController.search);

export { router as userRoutes };
