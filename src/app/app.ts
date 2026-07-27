import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { MsalService } from '@azure/msal-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {

  constructor(
    private msal: MsalService,
    private router: Router
  ) {}

  ngOnInit() {

    const accounts = this.msal.instance.getAllAccounts();

    if (accounts.length > 0) {

       this.msal.instance.setActiveAccount(accounts[0]);

    }

  }

}