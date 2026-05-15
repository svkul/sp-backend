import 'express';

import type { AuthenticatedUser } from '../auth/types';

// Augment Express's global `Request.user` (the same property that Passport
// historically populates) with our `AuthenticatedUser` shape. Using the
// `Express.User` namespace makes the augmentation merge with @types/passport-*.
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthenticatedUser {}
  }
}
