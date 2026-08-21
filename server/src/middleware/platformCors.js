import cors from 'cors';

function isAddressablesContentRequest(req) {
  return req.path === '/content' || req.path.startsWith('/content/');
}

/**
 * Creates the platform-wide CORS middleware used by the dashboard and APIs.
 *
 * Addressables content has a separate per-game origin policy. Skipping those
 * requests here is important because the `cors` package ends OPTIONS requests
 * immediately by default, before the content-specific middleware can inspect
 * the game's allowed origins.
 */
export function createPlatformCors(options) {
  const middleware = cors(options);
  return (req, res, next) => {
    if (isAddressablesContentRequest(req)) return next();
    return middleware(req, res, next);
  };
}

