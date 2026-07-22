import {
  PublicClientApplication,
  InteractionType,
  BrowserCacheLocation,
  LogLevel
} from '@azure/msal-browser';

import {
  MsalGuardConfiguration,
  MsalInterceptorConfiguration
} from '@azure/msal-angular';


// Dynamic redirect URL
const redirectUri = window.location.origin;


export const msalInstance = new PublicClientApplication({

  auth: {

    clientId: 'bffdfedc-9405-4d28-89a9-bef27f0e25ff',

    authority:
      'https://login.microsoftonline.com/818467cf-44b9-45a5-a41a-1ef924fcd795',

    redirectUri: redirectUri,

    postLogoutRedirectUri: redirectUri

  },


  cache: {

    cacheLocation: BrowserCacheLocation.LocalStorage

  },


  system: {

    loggerOptions: {

      logLevel: LogLevel.Info,

      loggerCallback(level, message) {

        console.log(message);

      }

    }

  }

});



export const protectedResources = {

  graph: {

    endpoint:
      'https://graph.microsoft.com/v1.0/',

    scopes: [

      'User.Read',

      'AuditLog.Read.All',

      'Directory.Read.All'

    ]

  }

};




export function MSALGuardConfig():

MsalGuardConfiguration {

  return {

    interactionType:
      InteractionType.Redirect,

    authRequest: {

      scopes:
        protectedResources.graph.scopes

    }

  };

}





export function MSALInterceptorConfig():

MsalInterceptorConfiguration {


  const protectedResourceMap =
    new Map<string, Array<string>>();



  protectedResourceMap.set(

    protectedResources.graph.endpoint,

    protectedResources.graph.scopes

  );



  return {

    interactionType:
      InteractionType.Redirect,

    protectedResourceMap

  };


}