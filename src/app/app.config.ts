import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';

import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { MSAL_INSTANCE, MsalService, MsalBroadcastService } from '@azure/msal-angular';

import { routes } from './app.routes';
import { msalInstance } from './msal.config';
import { AuthService } from './services/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),

    provideRouter(routes),

    // No MsalInterceptor: GraphService attaches the token itself.
    // The interceptor (and MsalGuard) fall back to full-page redirects,
    // which is what was reloading the app.
    provideHttpClient(),

    { provide: MSAL_INSTANCE, useValue: msalInstance },

    MsalService,
    MsalBroadcastService,

    provideAppInitializer(() => inject(AuthService).init()),
  ],
};
