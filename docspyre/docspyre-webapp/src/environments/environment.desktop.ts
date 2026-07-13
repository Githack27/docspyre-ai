// Environment used when the webapp is packaged into the Tauri desktop shell.
// The packaged frontend is served from the `tauri://` / `http://tauri.localhost`
// origin, so the backend must be reached via an absolute URL (a relative
// `/api/v1` would resolve against the Tauri origin, where no backend exists).
//
// `desktop: true` switches auth to a body-carried refresh token instead of the
// HttpOnly cookie (the cookie exists only to mitigate browser XSS, which does
// not apply to a packaged desktop app).
export const environment = {
  production: true,
  desktop: true,
  apiBaseUrl: 'https://docspyre-api.detqel.com/api/v1',
} as const;
