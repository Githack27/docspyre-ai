/**
 * Augments Express's Request with the authenticated principal set by the
 * `authenticate` middleware. Centralised here so every handler is type-safe.
 */
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
      };
    }
  }
}

export {};
