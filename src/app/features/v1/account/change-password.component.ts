import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SessionService } from '../../../core/v1/session.service';
import { ThemeService } from '../../../core/theme/theme.service';

function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw)) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  const labels = ['Muy débil', 'Muy débil', 'Débil', 'Media', 'Buena', 'Fuerte', 'Excelente'];
  return { score: s, label: labels[Math.min(s, 6)] };
}

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
    .wrap { min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: var(--bg-primary); }
    .card { width: min(430px, 100%); padding: 26px; border-radius: 16px; background: var(--glass-card);
      border: 1px solid var(--glass-border); backdrop-filter: blur(12px); display: flex; flex-direction: column; gap: 14px; }
    h1 { margin: 0; font-size: 20px; color: var(--text-heading); }
    .sub { margin: -8px 0 0; color: var(--text-muted); font-size: 13px; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--text-secondary);
      input { padding: 10px; border-radius: 9px; border: 1px solid var(--line); background: var(--fill-soft); color: var(--text-primary); font-size: 14.5px;
        &:focus { outline: none; border-color: var(--primary-500); } } }
    .bar { height: 6px; border-radius: 3px; background: var(--fill); overflow: hidden; }
    .bar i { display: block; height: 100%; transition: width .2s; }
    .msg { font-size: 12px; color: var(--text-muted); }
    .alert { padding: 10px; border-radius: 9px; background: var(--error-soft); color: var(--error-300); font-size: 12.5px; }
    .btn { padding: 11px; border-radius: 9px; border: none; background: linear-gradient(135deg, var(--primary-500), var(--primary-600)); color: #fff; font-weight: 700; cursor: pointer;
      &:disabled { opacity: .6; cursor: wait; } }
    .theme-toggle { position: fixed; top: 16px; right: 18px; }
  `],
  template: `
    <button type="button" class="theme-toggle" (click)="theme.toggle()" aria-label="Cambiar tema">{{ theme.theme() === 'dark' ? '☀️' : '🌙' }}</button>
    <div class="wrap">
      <form class="card" (ngSubmit)="submit()">
        <h1>Cambio de contraseña</h1>
        <p class="sub">{{ forced ? 'Su contraseña es temporal: el sistema exige cambiarla antes de continuar.' : 'Actualice su contraseña.' }}</p>
        @if (error()) { <div class="alert" role="alert">{{ error() }}</div> }
        <label>Contraseña actual <input type="password" name="cur" [(ngModel)]="current" autocomplete="current-password" required /></label>
        <label>Nueva contraseña <input type="password" name="new" [(ngModel)]="next" (ngModelChange)="calcStrength()" autocomplete="new-password" required /></label>
        @if (next) {
          <div>
            <div class="bar"><i [style.width.%]="(str().score / 6) * 100" [style.background]="barColor()"></i></div>
            <p class="msg">{{ str().label }} · mínimo 10 caracteres con mayúsculas, minúsculas y dígitos</p>
          </div>
        }
        <label>Confirmar nueva <input type="password" name="conf" [(ngModel)]="confirm" autocomplete="new-password" required /></label>
        <button class="btn" type="submit" [disabled]="loading()">{{ loading() ? 'Guardando…' : 'Cambiar contraseña' }}</button>
        @if (!forced) { <button class="btn" type="button" style="background:transparent;color:var(--text-secondary)" (click)="router.navigate(['/v1/dashboard'])">Volver</button> }
      </form>
    </div>
  `,
})
export class ChangePasswordComponent {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);

  current = '';
  next = '';
  confirm = '';
  loading = signal(false);
  error = signal<string | null>(null);
  str = signal({ score: 0, label: '' });
  forced = false;

  calcStrength(): void { this.str.set(strength(this.next)); }

  barColor(): string {
    const s = this.str().score;
    return s <= 2 ? 'var(--warning-500)' : s <= 4 ? 'var(--primary-500)' : 'var(--success-500)';
  }

  submit(): void {
    this.error.set(null);
    if (!this.current || !this.next) { this.error.set('Complete los campos'); return; }
    if (this.next !== this.confirm) { this.error.set('La confirmación no coincide'); return; }
    this.loading.set(true);
    this.session.changePassword(this.current, this.next).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/app/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'No se pudo cambiar la contraseña');
      },
    });
  }
}
