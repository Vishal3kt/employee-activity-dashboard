import { Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { LoadStage } from '../../services/graph';

type StepState = 'done' | 'active' | 'pending';

@Component({
  selector: 'app-dashboard-loader',
  standalone: true,
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: './dashboard-loader.html',
  styleUrl: './dashboard-loader.scss',
})
export class DashboardLoader implements OnInit, OnDestroy {
  /** Current stage reported by GraphService. */
  readonly stage = input<LoadStage>('token');

  readonly steps = [
    { key: 'token', label: 'Confirming your access' },
    { key: 'fetching', label: 'Loading employees and today’s sign-ins' },
    { key: 'preparing', label: 'Building your dashboard' },
  ] as const;

  /** Placeholders that mirror the real layout: 5 cards, 8 table rows. */
  readonly cards = [0, 1, 2, 3, 4];
  readonly rows = [0, 1, 2, 3, 4, 5, 6, 7];

  /** Shown when the request runs long, so the wait has an explanation. */
  readonly slow = signal(false);

  private readonly activeIndex = computed(() => {
    const index = this.steps.findIndex((step) => step.key === this.stage());
    return index === -1 ? 0 : index;
  });

  private slowTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.slowTimer = setTimeout(() => this.slow.set(true), 8000);
  }

  ngOnDestroy(): void {
    clearTimeout(this.slowTimer);
  }

  stateOf(index: number): StepState {
    const active = this.activeIndex();
    if (index < active) return 'done';
    if (index === active) return 'active';
    return 'pending';
  }
}
