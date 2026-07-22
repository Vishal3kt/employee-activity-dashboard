import { Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';

import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';

export const routes: Routes = [

  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },

  {
    path: 'login',
    component: Login
  },

  {
    path: 'dashboard',
    component: Dashboard,
    canActivate: [MsalGuard]
  },

  {
    path: '**',
    redirectTo: 'dashboard'
  }

];