import { Component, Directive, Injectable, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

const STOCK_LABEL: Record<string, string> = {
  normal: 'Normal', low: 'Baja', min_reached: 'Mínimo', out: 'Agotado',
  below_zero: 'Negativo', reorder: 'Reponer', over: 'Sobre-stock',
};
const STOCK_CLASS: Record<string, string> = {
  normal: 'light-green', low: 'light-yellow', min_reached: 'light-red', out: 'light-red',
  below_zero: 'light-red', reorder: 'light-yellow', over: 'light-blue',
};
const EXPIRY_LABEL: Record<string, string> = {
  green: 'Vigente', yellow: 'Próximo', red: 'Crítico', gray: 'Sin venc.', black: 'Vencido',
};
const EXPIRY_CLASS: Record<string, string> = {
  green: 'light-green', yellow: 'light-yellow', red: 'light-red', gray: 'light-gray', black: 'light-black',
};

@Component({
  selector: 'v1-light',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="chip" [class]="'chip ' + cls()">{{ label() }}</span>`,
  styles: [`
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px;
      font-size: 12px; font-weight: 600; border: 1px solid transparent; white-space: nowrap; }
    .chip::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    .light-green { color: var(--success-600); background: var(--success-soft); border-color: var(--success-line); }
    .light-yellow { color: var(--primary-200); background: var(--warning-soft); border-color: var(--warning-line); }
    .light-red { color: var(--error-300); background: var(--error-soft); border-color: var(--error-line); }
    .light-gray { color: var(--text-muted); background: var(--fill); border-color: var(--line); }
    .light-blue { color: var(--primary-300); background: var(--primary-soft); border-color: var(--line); }
    .light-black { color: var(--honeydew, #f1faee); background: #111; border-color: #000; }
    :host([data-theme='light']) .light-black, .light-black { background: #1d3557; color: #f1faee; }
  `],
})
export class LightChipComponent {
  @Input({ required: true }) kind: 'stock' | 'expiry' = 'stock';
  @Input({ required: true }) value = '';

  readonly label = computed(() => {
    const map = this.kind === 'stock' ? STOCK_LABEL : EXPIRY_LABEL;
    return map[this.value] ?? this.value;
  });
  readonly cls = computed(() => {
    const map = this.kind === 'stock' ? STOCK_CLASS : EXPIRY_CLASS;
    return map[this.value] ?? 'light-gray';
  });
}

@Component({
  selector: 'v1-status',
  standalone: true,
  template: `<span class="st st-{{ kind() }}">{{ text() }}</span>`,
  styles: [`
    .st { padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .st-draft { color: var(--text-muted); background: var(--fill); }
    .st-pending, .st-partial, .st-yellow { color: var(--primary-200); background: var(--warning-soft); }
    .st-approved, .st-confirmed, .st-received, .st-issued, .st-dispatched, .st-green { color: var(--success-600); background: var(--success-soft); }
    .st-cancelled, .st-blocked, .st-expired, .st-red { color: var(--error-300); background: var(--error-soft); }
    .st-invoiced { color: var(--primary-300); background: var(--primary-soft); }
  `],
})
export class StatusPillComponent {
  @Input({ required: true }) status = '';
  @Input() textOverride?: string;
  kind = computed(() => this.status.toLowerCase());
  text = computed(() => this.textOverride ?? this.status);
}

export interface ToastMsg { id: number; text: string; kind: 'ok' | 'warn' | 'error' }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<ToastMsg[]>([]);
  private seq = 0;

  ok(text: string) { this.push(text, 'ok'); }
  warn(text: string) { this.push(text, 'warn'); }
  error(err: unknown) {
    let text = 'Error inesperado';
    if (err && typeof err === 'object') {
      const e = err as { error?: { message?: string }; status?: number };
      if (e.error?.message) text = e.error.message;
      else if (e.status === 0) text = 'Sin conexión con el servidor (¿backend v1 corriendo en :8000?)';
      else if (e.status) text = `Error ${e.status}`;
    }
    this.push(text, 'error');
  }
  dismiss(id: number) { this.items.update((l) => l.filter((t) => t.id !== id)); }

  private push(text: string, kind: ToastMsg['kind']) {
    const item = { id: ++this.seq, text, kind };
    this.items.update((l) => [...l.slice(-3), item]);
    setTimeout(() => this.dismiss(item.id), kind === 'error' ? 8000 : 4000);
  }
}

@Component({
  selector: 'v1-toasts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of service.items(); track t.id) {
        <div class="toast" [class]="'toast t-' + t.kind" role="status">
          <span>{{ t.text }}</span>
          <button type="button" aria-label="Cerrar" (click)="service.dismiss(t.id)">×</button>
        </div>
      }
    </div>`,
  styles: [`
    .toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 1000; }
    .toast { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 10px;
      backdrop-filter: blur(8px); border: 1px solid var(--glass-border); background: var(--glass-card);
      color: var(--text-primary); box-shadow: 0 8px 24px rgba(0,0,0,.25); max-width: 420px; }
    .toast button { background: none; border: none; color: var(--text-muted); font-size: 16px; cursor: pointer; }
    .t-ok { border-left: 4px solid var(--success-500); }
    .t-warn { border-left: 4px solid var(--warning-500); }
    .t-error { border-left: 4px solid var(--error-500); }
  `],
})
export class ToastsComponent {
  service = inject(ToastService);
}

@Directive({ selector: '[v1Enter]' })
export class EnterDirective {
  // placeholder: navegación por teclado se resuelve con tabindex en cada formulario
}

export interface ConfirmChoice { value: boolean }

@Component({
  selector: 'v1-confirm',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (open()) {
      <div class="backdrop" (click)="answer(false)">
        <div class="panel glass-panel" role="alertdialog" aria-modal="true" (click)="$event.stopPropagation()">
          <h3>{{ title() }}</h3>
          <p>{{ message() }}</p>
          <div class="row">
            <button class="btn ghost" (click)="answer(false)">Cancelar</button>
            <button class="btn" [class.danger]="danger()" (click)="answer(true)">{{ confirmLabel() }}</button>
          </div>
        </div>
      </div>
    }`,
  styles: [`
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: grid; place-items: center; z-index: 900; }
    .panel { width: min(440px, 92vw); padding: 20px; border-radius: 14px; }
    .panel h3 { margin: 0 0 8px; color: var(--text-heading); }
    .panel p { margin: 0 0 18px; color: var(--text-secondary); }
    .row { display: flex; justify-content: flex-end; gap: 10px; }
    .btn { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--primary-500); background: var(--primary-500);
      color: var(--honeydew, #fff); cursor: pointer; font-weight: 600; }
    .btn.ghost { background: transparent; color: var(--text-secondary); border-color: var(--line); }
    .btn.danger { background: var(--warning-500); border-color: var(--warning-500); }
  `],
})
export class ConfirmModalComponent {
  readonly open = signal(false);
  readonly title = signal('Confirmar');
  readonly message = signal('¿Continuar?');
  readonly danger = signal(false);
  readonly confirmLabel = signal('Confirmar');
  private resolver?: (v: boolean) => void;

  ask(opts: { title?: string; message: string; danger?: boolean; confirmLabel?: string }): Promise<boolean> {
    this.title.set(opts.title ?? 'Confirmar');
    this.message.set(opts.message);
    this.danger.set(opts.danger ?? false);
    this.confirmLabel.set(opts.confirmLabel ?? 'Confirmar');
    this.open.set(true);
    return new Promise((resolve) => (this.resolver = resolve));
  }

  answer(v: boolean) {
    this.open.set(false);
    this.resolver?.(v);
    this.resolver = undefined;
  }
}

export function httpErrorText(err: HttpErrorResponse): string {
  const body = err.error as { message?: string } | null;
  if (body?.message) return body.message;
  if (err.status === 0) return 'Sin conexión con el servidor';
  return `Error ${err.status}`;
}
