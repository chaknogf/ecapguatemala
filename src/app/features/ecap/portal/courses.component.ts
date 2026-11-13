import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AcademicService } from '../../../core/academic/academic.service';

@Component({
  selector: 'app-portal-courses',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
  <h1>Mis cursos</h1>
  <div class="filters">
    <button [class.active]="filter()==='all'" (click)="filter.set('all')">Todos</button>
    <button [class.active]="filter()==='active'" (click)="filter.set('active')">Activos</button>
    <button [class.active]="filter()==='finished'" (click)="filter.set('finished')">Finalizados</button>
  </div>
  <div class="cards">
    @for (c of filtered(); track c.id) {
      <a class="course-card glass-panel" [routerLink]="['/portal/courses', c.id]">
        <div class="cover"></div>
        <div class="body">
          <h3>{{ c.name }}</h3>
          <p>{{ c.description }}</p>
          <div class="meta">{{ c.level }} · {{ c.duration_hours }}h</div>
          <div class="status">{{ c.status }}</div>
        </div>
      </a>
    } @empty { <p>No tienes cursos.</p> }
  </div>
  `,
  styles: [`
    h1 { margin-bottom:16px; }
    .filters { display:flex; gap:8px; margin-bottom:16px; }
    .filters button { padding:6px 12px; border-radius:8px; border:1px solid var(--line); background:var(--surface); cursor:pointer; }
    .filters button.active { background:var(--primary-500); color:#fff; }
    .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
    .course-card { border-radius:12px; overflow:hidden; text-decoration:none; color:var(--text-primary); }
    .cover { height:100px; background:linear-gradient(135deg,#2563eb,#7c3aed); }
    .body { padding:12px; }
    .meta { font-size:12px; color:var(--text-muted); }
    .status { font-size:12px; color:var(--primary-300); }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class PortalCoursesComponent implements OnInit {
  private readonly api = inject(AcademicService);
  readonly courses = signal<any[]>([]);
  readonly filter = signal('all');

  get filtered(): any {
    const f = this.filter();
    if (f === 'all') return this.courses();
    return this.courses().filter((c) => c.status === f || (f === 'active' && c.status === 'published'));
  }

  ngOnInit(): void {
    this.api.courses().subscribe({ next: (d) => this.courses.set(d) });
  }
}
