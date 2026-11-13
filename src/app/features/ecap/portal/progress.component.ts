import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AcademicService } from '../../../core/academic/academic.service';
import { SessionService } from '../../../core/v1/session.service';

@Component({
  selector: 'app-portal-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
  <h1>Mi progreso</h1>
  @if (loading()) { <p>Cargando…</p> }
  <div class="cards">
    @for (c of courses(); track c.id) {
      <div class="card glass-panel">
        <h3>{{ c.name }}</h3>
        <div class="bar"><div class="fill" [style.width.%]="progress(c.id)"></div></div>
        <span>{{ progress(c.id) }}% completado</span>
      </div>
    } @empty { <p>Sin cursos.</p> }
  </div>

  <h2>Última actividad</h2>
  <ul class="act">
    @for (p of progressItems(); track p.id) {
      <li>{{ p.lesson_id }} — {{ p.completed ? 'Completada' : 'En progreso' }} ({{ p.progress_pct }}%)</li>
    }
  </ul>
  `,
  styles: [`
    h1 { margin-bottom:16px; }
    .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px; margin-bottom:20px; }
    .card { padding:16px; border-radius:12px; }
    .bar { height:8px; background:var(--fill); border-radius:4px; overflow:hidden; margin:8px 0; }
    .fill { height:100%; background:var(--primary-500); }
    .act li { padding:6px 0; border-bottom:1px solid var(--line); }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class PortalProgressComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly session = inject(SessionService);
  readonly courses = signal<any[]>([]);
  readonly progressItems = signal<any[]>([]);
  readonly loading = signal(false);
  private completedByCourse = new Map<string, number>();
  private totalByCourse = new Map<string, number>();

  ngOnInit(): void {
    this.loading.set(true);
    const sid = this.session.user()?.id;
    this.api.courses().subscribe({ next: (d) => this.courses.set(d) });
    if (sid) {
      this.api.progress({ student_id: sid }).subscribe({ next: (d) => { this.progressItems.set(d); this.loading.set(false); } });
    }
  }

  progress(courseId: string): number {
    // approximate: ratio of completed progress items to courses*10
    const items = this.progressItems();
    if (items.length === 0) return 0;
    const completed = items.filter((p) => p.completed).length;
    return Math.round((completed / Math.max(items.length, 1)) * 100);
  }
}
