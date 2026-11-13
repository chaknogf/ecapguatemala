import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AcademicService } from '../../../core/academic/academic.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-activity',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="head"><h1>Actividad del sistema</h1></div>
  @if (loading()) { <p>Cargando…</p> }
  <div class="table-wrap glass-panel">
    <table>
      <thead><tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>ID</th><th>Detalle</th></tr></thead>
      <tbody>
        @for (a of items(); track a.id) {
          <tr>
            <td>{{ a.created_at }}</td>
            <td>{{ a.action }}</td>
            <td>{{ a.entity_type }}</td>
            <td>{{ a.entity_id }}</td>
            <td>{{ a.details }}</td>
          </tr>
        } @empty { <tr><td colspan="5">Sin actividad.</td></tr> }
      </tbody>
    </table>
  </div>
  `,
  styles: [`
    .head { margin-bottom:16px; }
    .table-wrap { overflow:auto; border-radius:12px; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--line); }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class ActivityComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly toast = inject(ToastService);
  readonly items = signal<any[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.api.activity(50).subscribe({ next: (d) => { this.items.set(d); this.loading.set(false); }, error: (e) => { this.toast.error(e); this.loading.set(false); } });
  }
}
