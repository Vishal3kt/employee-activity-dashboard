import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { msalInstance } from './app/msal.config';
import 'zone.js';

async function bootstrap() {

  await msalInstance.initialize();

  await msalInstance.handleRedirectPromise();

  bootstrapApplication(App, appConfig)
    .catch(console.error);

}

bootstrap();