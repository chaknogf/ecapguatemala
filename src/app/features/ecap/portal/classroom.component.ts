import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AcademicService } from '../../../core/academic/academic.service';
import { SessionService } from '../../../core/v1/session.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-portal-classroom',
  standalone: true,
  imports: [CommonModule],
  template: `
  @if (loading()) { <p>Cargando…</p> }
  @else {
    <div class="layout">
      <aside class="sidebar glass-panel">
        <h3>Unidades</h3>
        @for (u of units(); track u.id) {
          <div class="unit">
            <strong>{{ u.title }}</strong>
            <ul>
              @for (l of lessonsByUnit(u.id); track l.id) {
                <li>
                  <button [class.active]="selectedLesson()?.id === l.id" (click)="selectLesson(l)">{{ l.title }}</button>
                </li>
              }
            </ul>
          </div>
        }
      </aside>
      <section class="content">
        @if (selectedLesson(); as l) {
          <h2>{{ l.title }}</h2>
          <p class="desc">{{ l.description }}</p>

          @if (videoUrl()) {
            <video controls [src]="videoUrl()!" class="video"></video>
          }

          <div class="materials">
            <h3>Materiales</h3>
            @for (r of lessonResources(); track r.id) {
              <div class="mat">
                <span>{{ r.title }} ({{ r.type }})</span>
                @if (r.url) { <a [href]="r.url" target="_blank" (click)="markViewed(l)">Descargar/Abrir</a> }
              </div>
            } @empty { <p>Sin materiales.</p> }
          </div>

          <div class="nav">
            <button (click)="prev()" [disabled]="!hasPrev()">Anterior</button>
            <button (click)="next()" [disabled]="!hasNext()">Siguiente</button>
            <button class="primary" (click)="markComplete(l)">Marcar completada</button>
          </div>
        } @else {
          <p>Selecciona una lección del menú lateral.</p>
        }
      </section>
    </div>
  }
  `,
  styles: [`
    .layout { display:grid; grid-template-columns:260px 1fr; gap:16px; }
    .sidebar { padding:12px; border-radius:12px; max-height:80vh; overflow:auto; }
    .unit { margin-bottom:12px; }
    .unit strong { display:block; margin-bottom:4px; }
    .unit ul { list-style:none; padding:0; margin:0; }
    .unit li button { width:100%; text-align:left; padding:6px 8px; border:none; background:none; cursor:pointer; border-radius:6px; color:var(--text-secondary); }
    .unit li button.active { background:var(--primary-soft); color:var(--primary-300); }
    .content { padding:12px; }
    .desc { color:var(--text-secondary); }
    .video { width:100%; max-height:420px; border-radius:12px; margin:12px 0; }
    .materials { margin:16px 0; }
    .mat { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); }
    .nav { display:flex; gap:8px; margin-top:16px; }
    .nav button { padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:var(--surface); cursor:pointer; }
    .nav button.primary { background:var(--primary-500); color:#fff; border-color:var(--primary-500); }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class PortalClassroomComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);

  readonly units = signal<any[]>([]);
  readonly lessons = signal<any[]>([]);
  readonly resources = signal<any[]>([]);
  readonly selectedLesson = signal<any>(null);
  readonly loading = signal(true);

  classroomId = '';
  allLessons: any[] = [];

  ngOnInit(): void {
    this.classroomId = this.route.snapshot.paramMap.get('id')!;
    this.api.units(this.classroomId).subscribe({
      next: (us) => {
        this.units.set(us);
        // fetch lessons for all units
        let pending = us.length;
        const all: any[] = [];
        if (pending === 0) { this.loading.set(false); return; }
        us.forEach((u: any) => {
          this.api.lessons(u.id).subscribe({
            next: (ls) => {
              all.push(...ls.map((l: any) => ({ ...l, unit_id: u.id })));
              pending--;
              if (pending === 0) {
                all.sort((a, b) => a.order_index - b.order_index);
                this.allLessons = all;
                this.lessons.set(all);
                this.loading.set(false);
                if (all.length) this.selectLesson(all[0]);
              }
            },
          });
        });
      },
    });
    this.api.resources({ classroom_id: this.classroomId }).subscribe({ next: (d) => this.resources.set(d) });
  }

  lessonsByUnit(unitId: string): any[] {
    return this.lessons().filter((l) => l.unit_id === unitId);
  }

  selectLesson(l: any): void {
    this.selectedLesson.set(l);
    this.api.resources({ lesson_id: l.id }).subscribe({ next: (d) => this.resources.set(d) });
    this.api.updateProgress({ student_id: this.session.user()?.id, lesson_id: l.id, completed: false, progress_pct: 50 }).subscribe();
  }

  lessonResources(): any[] { return this.resources(); }
  videoUrl(): string | null { return this.resources().find((r: any) => r.type === 'video')?.url ?? null; }

  hasPrev(): boolean { const i = this.currentIndex(); return i > 0; }
  hasNext(): boolean { const i = this.currentIndex(); return i >= 0 && i < this.allLessons.length - 1; }
  currentIndex(): number { return this.allLessons.findIndex((l) => l.id === this.selectedLesson()?.id); }
  prev(): void { const i = this.currentIndex(); if (i > 0) this.selectLesson(this.allLessons[i - 1]); }
  next(): void { const i = this.currentIndex(); if (i < this.allLessons.length - 1) this.selectLesson(this.allLessons[i + 1]); }

  markComplete(l: any): void {
    this.api.updateProgress({ student_id: this.session.user()?.id, lesson_id: l.id, completed: true, progress_pct: 100 }).subscribe({
      next: () => this.toast.ok('Lección marcada como completada'),
      error: (e) => this.toast.error(e),
    });
  }

  markViewed(l: any): void {
    this.api.updateProgress({ student_id: this.session.user()?.id, lesson_id: l.id, completed: false, progress_pct: 75 }).subscribe();
  }
}
