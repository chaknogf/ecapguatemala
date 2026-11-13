import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { V1PlatformService, AuditEvent } from '../../../core/v1/platform.service';
import { ToastService } from '../../../shared/ui';

const SENSITIVE = ['password', 'token', 'secret', 'argon2', 'authorization', 'hash'];

@Component({
  selector: 'app-v1-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit.component.html',
  styleUrl: './audit.component.scss',
})
export class AuditComponent implements OnInit {
  private readonly platform = inject(V1PlatformService);
  private readonly toast = inject(ToastService);

  readonly events = signal<AuditEvent[]>([]);
  readonly loading = signal(true);
  readonly filterEntity = signal('');
  readonly filterAction = signal('');
  readonly expanded = signal<string | null>(null);
  readonly page = signal(1);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.platform.audit({
      entity_type: this.filterEntity() || undefined,
      action: this.filterAction() || undefined,
      page: this.page(),
    }).subscribe({
      next: (e) => { this.events.set(e); this.loading.set(false); },
      error: (err) => { this.toast.error(err); this.loading.set(false); },
    });
  }

  toggle(id: string): void { this.expanded.update((x) => (x === id ? null : id)); }

  hasSecrets(json: unknown): boolean {
    const s = JSON.stringify(json).toLowerCase();
    return SENSITIVE.some((k) => s.includes(k));
  }

  fmt(v: unknown): string {
    if (v == null) return '—';
    return typeof v === 'string' ? v : JSON.stringify(v, null, 1);
  }

  time(e: AuditEvent): string { return e.occurred_at.slice(0, 19).replace('T', ' '); }
}
