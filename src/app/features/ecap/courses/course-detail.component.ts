import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AcademicService } from '../../../core/academic/academic.service';

@Component({
  selector: 'app-course-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
  @if (loading()) { <p>Cargando…</p> }
  @else if (course(); as c) {
    <a routerLink="/app/courses" class="back">← Volver</a>
    <div class="hero glass-panel">
      <h1>{{ c.name }}</h1>
      <p>{{ c.description }}</p>
      <div class="meta">{{ c.code }} · {{ c.level }} · {{ c.duration_hours }}h · {{ c.status }}</div>
      <h3>Objetivos</h3>
      <p>{{ c.objectives }}</p>
    </div>
    <h2>Aulas</h2>
    <div class="cards">
      @for (r of classrooms(); track r.id) {
        <div class="card glass-panel">
          <h3>{{ r.name }}</h3>
          <p>{{ r.description }}</p>
          <div class="meta">{{ r.modality }} · {{ r.status }}</div>
        </div>
      } @empty { <p>Sin aulas.</p> }
    </div>
  }
  `,
  styles: [`
    .back { display:inline-block; margin-bottom:12px; color:var(--primary-300); text-decoration:none; }
    .hero { padding:20px; border-radius:12px; margin-bottom:20px; }
    .meta { font-size:12px; color:var(--text-muted); margin:8px 0; }
    .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px; }
    .card { padding:16px; border-radius:12px; }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class CourseDetailComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly route = inject(ActivatedRoute);
  readonly course = signal<any>(null);
  readonly classrooms = signal<any[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.course(id).subscribe({ next: (c) => { this.course.set(c); this.loading.set(false); } });
    this.api.classrooms({ course_id: id }).subscribe({ next: (d) => this.classrooms.set(d) });
  }
}
