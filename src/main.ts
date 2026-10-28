/**
 * Entry point.
 *
 * The Microsoft sign-in popup returns to /auth-redirect. On that page we
 * don't start Angular: MSAL's redirect bridge passes the sign-in result back
 * to the main window and closes the popup. Every other page boots the app.
 */

const AUTH_REDIRECT_PATH = '/auth-redirect';

if (window.location.pathname === AUTH_REDIRECT_PATH) {
  import('@azure/msal-browser/redirect-bridge')
    .then(({ broadcastResponseToMainFrame }) => broadcastResponseToMainFrame())
    .catch((err) => {
      console.error('[Auth] Could not complete sign-in in popup', err);
      document.body.textContent = 'Sign-in couldn’t be completed. Close this window and try again.';
    });
} else {
  // Zone.js must load before Angular, because app.config.ts uses
  // provideZoneChangeDetection(). Everything is loaded lazily so the
  // sign-in popup doesn't download or start the whole app.
  import('zone.js')
    .then(() =>
      Promise.all([
        import('@angular/platform-browser'),
        import('./app/app'),
        import('./app/app.config'),
      ]),
    )
    .then(([{ bootstrapApplication }, { App }, { appConfig }]) =>
      bootstrapApplication(App, appConfig),
    )
    .catch((err) => console.error(err));
}
