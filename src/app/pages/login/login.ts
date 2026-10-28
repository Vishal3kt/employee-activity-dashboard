import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService, describeAuthError } from '../../services/auth';

type LoginStatus = 'checking' | 'idle' | 'redirecting';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly status = signal<LoginStatus>('checking');
  readonly error = signal<string | null>(null);

  /** Set when someone signed out earlier, so we can offer "Continue as …". */
  readonly rememberedUser = signal<string | null>(this.auth.rememberedUser);

  readonly busyLabel = computed(() =>
    this.status() === 'checking' ? 'Checking your session…' : 'Signing you in…',
  );

  /** Illustrative rows for the preview panel (not real data). */
  readonly sampleLog = [
    { time: '09:46', initials: 'JP', city: 'Bengaluru', app: 'Azure Portal', ok: true },
    { time: '09:42', initials: 'AK', city: 'Hyderabad', app: 'Outlook', ok: true },
    { time: '09:41', initials: 'RM', city: 'Chennai', app: 'Teams', ok: false },
    { time: '09:39', initials: 'SL', city: 'Pune', app: 'SharePoint', ok: true },
    // { time: '09:33', initials: 'NC', city: 'Toronto', app: 'Teams', ok: true },
    { time: '09:31', initials: 'DV', city: 'Unknown', app: 'Outlook', ok: false },
  ];

  ngOnInit(): void {
    // Show any error from a failed redirect (e.g. consent not granted)
    this.error.set(this.auth.lastError());

    this.auth.ready$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.auth.isLoggedIn) {
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      } else {
        this.status.set('idle');
      }
    });
  }

  login(): void {
    this.run(() => this.auth.signIn());
  }

  useDifferentAccount(): void {
    this.rememberedUser.set(null);
    this.run(() => this.auth.signIn(true));
  }

  /** Starts sign-in synchronously inside the click, so popups aren't blocked. */
  private run(start: () => Observable<boolean>): void {
    if (this.status() !== 'idle') {
      return;
    }

    this.error.set(null);
    this.status.set('redirecting');

    start()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (signedIn) => {
          if (signedIn) {
            this.router.navigate(['/dashboard'], { replaceUrl: true });
          }
          // false: a redirect fallback has started; keep the busy state
        },
        error: (err) => {
          console.error(err);
          this.error.set(describeAuthError(err));
          this.status.set('idle');
        },
      });
  }
}
