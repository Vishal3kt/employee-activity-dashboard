import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import { FEATURES } from './features';
import { AccountInfo, InteractionStatus } from '@azure/msal-browser';
import { BehaviorSubject, Observable, filter, firstValueFrom, from, map, take } from 'rxjs';

/**
 * Popup-only authentication.
 * Nothing in this service navigates the main window to Microsoft,
 * so the app never reloads during sign-in or sign-out.
 */

/** Scopes the dashboard needs. Reuse these in GraphService too. */
export const GRAPH_SCOPES = [
  'User.Read',
  'AuditLog.Read.All',
  'Directory.Read.All',
  // Only requested when the Teams presence feature is switched on
  ...(FEATURES.teamsPresence ? ['Presence.Read.All'] : []),
];

/**
 * Where the sign-in popup returns. main.ts handles this path with MSAL's
 * redirect bridge (required by msal-browser v5) instead of starting the app.
 * Register this exact URL in Entra ID as a Single-page application redirect URI.
 */
const POPUP_REDIRECT_URI = `${window.location.origin}/auth-redirect`;

/** Who signed out last, so "Continue as …" can pre-fill the account. */
const LAST_USER_KEY = 'employee-activity.last-user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private msal = inject(MsalService);
  private broadcast = inject(MsalBroadcastService);
  private router = inject(Router);

  private readonly accountSubject = new BehaviorSubject<AccountInfo | null>(null);

  /** The signed-in account, or null when signed out. */
  readonly account$ = this.accountSubject.asObservable();

  /** Message for the login page (expired session, blocked popup…). */
  readonly lastError = signal<string | null>(null);

  /** Emits once when MSAL is idle. Only read accounts after this. */
  readonly ready$: Observable<void> = this.broadcast.inProgress$.pipe(
    filter((status) => status === InteractionStatus.None),
    take(1),
    map(() => undefined),
  );

  private initialized = false;

  /** Called once at startup (see app.config.ts). Initializes MSAL. */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    try {
      // Required by MSAL to initialize; returns null because we never redirect
      await firstValueFrom(this.msal.handleRedirectObservable());
    } catch (err) {
      console.error('[Auth] MSAL initialization failed', err);
    }

    this.syncAccount();
  }

  get account(): AccountInfo | null {
    return this.accountSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.msal.instance.getAllAccounts().length > 0;
  }

  /** The account that signed out last on this browser, if any. */
  get rememberedUser(): string | null {
    try {
      return localStorage.getItem(LAST_USER_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Signs in with a Microsoft popup. The page underneath never reloads.
   * While your Microsoft session is still open, the popup signs you in and
   * closes by itself; otherwise it asks for password and Authenticator code.
   * Must be called directly from a click, or the browser may block the popup.
   */
  signIn(differentAccount = false): Observable<boolean> {
    this.lastError.set(null);

    const loginHint = differentAccount ? null : this.rememberedUser;

    return this.msal
      .loginPopup({
        scopes: GRAPH_SCOPES,
        redirectUri: POPUP_REDIRECT_URI,
        ...(loginHint ? { loginHint } : { prompt: 'select_account' }),
      })
      .pipe(
        map((result) => {
          this.msal.instance.setActiveAccount(result.account);
          this.remember(result.account.username);
          this.accountSubject.next(result.account);
          return true;
        }),
      );
  }

  /**
   * Signs out of this app instantly: removes its tokens from the browser
   * without opening any Microsoft page. Your Microsoft session is untouched.
   */
  logout(): Observable<void> {
    const account = this.msal.instance.getActiveAccount() ?? undefined;

    if (account?.username) {
      this.remember(account.username);
    }

    return from(this.clearLocalSession(account));
  }

  /** Tokens can't be renewed: back to the login page with a message. */
  sessionExpired(): void {
    this.lastError.set('Your session has expired. Sign in again to continue.');
    const account = this.msal.instance.getActiveAccount() ?? undefined;
    void this.clearLocalSession(account);
  }

  // ---------- internals ----------

  private async clearLocalSession(account?: AccountInfo): Promise<void> {
    try {
      await this.msal.instance.clearCache({ account });
    } catch (err) {
      console.warn('[Auth] Could not clear token cache', err);
    }

    this.msal.instance.setActiveAccount(null);
    this.accountSubject.next(null);
    await this.router.navigate(['/login'], { replaceUrl: true });
  }

  private remember(username: string): void {
    try {
      localStorage.setItem(LAST_USER_KEY, username);
    } catch {
      /* ignore */
    }
  }

  private syncAccount(): void {
    const instance = this.msal.instance;
    let account = instance.getActiveAccount();

    if (!account) {
      const [first] = instance.getAllAccounts();
      if (first) {
        instance.setActiveAccount(first);
        account = first;
      }
    }

    this.accountSubject.next(account);
  }
}

/** Turns MSAL / Entra errors into something an admin can act on. */
export function describeAuthError(err: unknown): string {
  const e = err as { errorCode?: string; errorMessage?: string; message?: string };
  const text = `${e?.errorCode ?? ''} ${e?.errorMessage ?? e?.message ?? ''}`;

  if (text.includes('popup_window_error') || text.includes('empty_window_error')) {
    return 'Your browser blocked the Microsoft sign-in window. Allow pop-ups for this site, then try again.';
  }

  if (text.includes('user_cancelled') || text.includes('AADSTS65004')) {
    return 'The sign-in window was closed before sign-in finished. Select the button to try again.';
  }

  if (text.includes('AADSTS50011')) {
    return 'The sign-in window’s return address isn’t registered. Add /auth-redirect as a Single-page application redirect URI in Entra ID.';
  }

  if (text.includes('AADSTS65001') || text.toLowerCase().includes('consent')) {
    return 'An administrator needs to grant consent for AuditLog.Read.All and Directory.Read.All before you can sign in.';
  }

  if (text.includes('AADSTS50105') || text.includes('AADSTS50020')) {
    return 'Your account does not have access to this app. Ask your administrator to assign you to it.';
  }

  if (text.includes('interaction_in_progress')) {
    return 'A Microsoft sign-in window is already open. Finish or close it, then try again.';
  }

  return 'Sign-in failed. Try again, and contact your administrator if it keeps happening.';
}
