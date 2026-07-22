import {
  ApplicationConfig,
  provideZoneChangeDetection
} from '@angular/core';

import {
  provideHttpClient,
  withInterceptorsFromDi,
  HTTP_INTERCEPTORS
} from '@angular/common/http';

import { provideRouter } from '@angular/router';

import {
  MSAL_INSTANCE,
  MSAL_GUARD_CONFIG,
  MSAL_INTERCEPTOR_CONFIG,
  MsalGuard,
  MsalService,
  MsalBroadcastService,
  MsalInterceptor
} from '@azure/msal-angular';

import { routes } from './app.routes';

import {
  msalInstance,
  MSALGuardConfig,
  MSALInterceptorConfig
} from './msal.config';

export const appConfig: ApplicationConfig = {
  providers: [

    provideZoneChangeDetection({
      eventCoalescing: true
    }),

    provideRouter(routes),

    provideHttpClient(withInterceptorsFromDi()),

    {
      provide: MSAL_INSTANCE,
      useValue: msalInstance
    },

    {
      provide: MSAL_GUARD_CONFIG,
      useFactory: MSALGuardConfig
    },

    {
      provide: MSAL_INTERCEPTOR_CONFIG,
      useFactory: MSALInterceptorConfig
    },

    {
      provide: HTTP_INTERCEPTORS,
      useClass: MsalInterceptor,
      multi: true
    },

    MsalService,
    MsalGuard,
    MsalBroadcastService

  ]
};