import { Component } from '@angular/core';
import { Router } from '@angular/router';

import { MsalService } from '@azure/msal-angular';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {

  loading = false;

  constructor(
    private msal: MsalService,
    private router: Router
  ) {}

ngOnInit() {

  const accounts = this.msal.instance.getAllAccounts();

  if (accounts.length > 0) {

    this.msal.instance.setActiveAccount(accounts[0]);

    this.router.navigate(['/dashboard']);

  } else {

    this.loading = false;

  }

}

 login() {

  this.loading = true;

  this.msal.loginRedirect({
    scopes: [
      'User.Read',
      'AuditLog.Read.All',
      'Directory.Read.All'
    ]
  });

}
 logout() {

  this.msal.logoutRedirect({
    postLogoutRedirectUri: window.location.origin
  });

}
}