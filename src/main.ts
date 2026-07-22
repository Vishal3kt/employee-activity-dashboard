import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { msalInstance } from './app/msal.config';
import 'zone.js';

async function bootstrap() {

  await msalInstance.initialize();

  const result = await msalInstance.handleRedirectPromise();

  console.log('MSAL Redirect Result:', result);

  bootstrapApplication(App, appConfig)
    .catch(err => console.error(err));

}

bootstrap();