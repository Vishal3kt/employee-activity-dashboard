import { Component, computed, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { FailedSignIn, FailureCategory, FailureReport } from '../../models/report.model';
import { CATEGORY_LABELS, countryName, isSuspicious } from '../../services/sign-in-insights';

/** Rows shown before "Show all". */
const PREVIEW_ROWS = 10;

@Component({
  selector: 'app-failed-sign-ins',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatIconModule],
  templateUrl: './failed-sign-ins.html',
  styleUrl: './failed-sign-ins.scss',
})
export class FailedSignIns {
  readonly report = input.required<FailureReport>();

  readonly showAll = signal(false);

  readonly categoryLabels = CATEGORY_LABELS;

  /** Only failures that can indicate an attack. All failures are in the Excel export. */
  readonly list = computed<FailedSignIn[]>(() => this.report().suspicious);

  readonly visible = computed(() =>
    this.showAll() ? this.list() : this.list().slice(0, PREVIEW_ROWS),
  );

  readonly hiddenCount = computed(() => Math.max(0, this.list().length - PREVIEW_ROWS));

  readonly maxCountry = computed(() => this.report().byCountry[0]?.attempts ?? 1);

  readonly homeLabel = computed(() =>
    this.report()
      .homeCountries.map((c) => countryName(c))
      .join(', '),
  );

  readonly topIps = computed(() => this.report().byIp.slice(0, 8));

  isSuspicious(category: FailureCategory): boolean {
    return isSuspicious(category);
  }

  barWidth(attempts: number): string {
    return `${Math.max(4, Math.round((attempts / this.maxCountry()) * 100))}%`;
  }
}
