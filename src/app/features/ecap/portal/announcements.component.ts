import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AcademicService } from '../../../core/academic/academic.service';

@Component({
  selector: 'app-portal-announcements',
  standalone: true,
  imports: [CommonModule],
  template: `
  <h1>Avisos</h1>
  @if (loading()) { <p>Cargando…</p> }
  <div class="list">
    @for (a of items(); track a.id) {
      <div class="item glass-panel">
        <div class="top"><strong>{{ a.title }}</strong> @if (a.pinned) { <span>📌</span> } <small>{{ a.published_at }}</small></div>
        <p>{{ a.content }}</p>
      </div>
    } @empty { <p>Sin avisos.</p> }
  </div>
  `,
  styles: [`
    h1 { margin-bottom:16px; }
    .list { display:flex; flex-direction:column; gap:12px; }
    .item { padding:14px; border-radius:12px; }
    .top { display:flex; gap:8px; align-items:center; }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class PortalAnnouncementsComponent implements OnInit {
  private readonly api = inject(AcademicService);
  readonly items = signal<any[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.api.announcements().subscribe({ next: (d) => { this.items.set(d); this.loading.set(false); }, error: () => this.loading.set(false) });
  }
}
