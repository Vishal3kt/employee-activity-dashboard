import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './header.html',
  // Your existing header.scss + the new profile menu styles
  styleUrls: ['./header.scss'],
})
export class Header {
  private auth = inject(AuthService);

  lastUpdated = new Date();

  readonly account = toSignal(this.auth.account$, { initialValue: null });

  readonly displayName = computed(
    () => this.account()?.name || this.account()?.username || 'Signed in',
  );

  readonly email = computed(() => this.account()?.username ?? '');

  readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join(''),
  );

  readonly signingOut = signal(false);

  logout(): void {
    if (this.signingOut()) {
      return;
    }

    this.signingOut.set(true);

    this.auth.logout().subscribe({
      error: (err) => {
        console.error(err);
        this.signingOut.set(false);
      },
    });
  }
}
