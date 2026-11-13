import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AcademicService } from '../../../core/academic/academic.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-courses',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
  <div class="head">
    <h1>Cursos</h1>
    <button class="btn primary" (click)="openForm()">+ Nuevo curso</button>
  </div>

  <div class="toolbar">
    <input placeholder="Buscar" [(ngModel)]="search" (ngModelChange)="load()" />
    <select [(ngModel)]="statusFilter" (ngModelChange)="load()">
      <option value="">Todos</option>
      <option value="draft">Borrador</option>
      <option value="review">En revisión</option>
      <option value="published">Publicado</option>
      <option value="active">Activo</option>
      <option value="finished">Finalizado</option>
      <option value="archived">Archivado</option>
    </select>
  </div>

  @if (showForm()) {
    <div class="card glass-panel form">
      <h3>{{ editing() ? 'Editar curso' : 'Nuevo curso' }}</h3>
      <div class="grid2">
        <label>Código<input [(ngModel)]="form.code" [disabled]="!!editing()" /></label>
        <label>Nombre<input [(ngModel)]="form.name" /></label>
        <label>Categoría
          <select [(ngModel)]="form.category_id">
            <option value="">Sin categoría</option>
            @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>
        </label>
        <label>Nivel
          <select [(ngModel)]="form.level">
            <option value="Básico">Básico</option>
            <option value="Intermedio">Intermedio</option>
            <option value="Avanzado">Avanzado</option>
          </select>
        </label>
        <label>Duración (horas)<input type="number" [(ngModel)]="form.duration_hours" /></label>
        <label>Estado
          <select [(ngModel)]="form.status">
            <option value="draft">Borrador</option>
            <option value="review">En revisión</option>
            <option value="published">Publicado</option>
            <option value="active">Activo</option>
            <option value="finished">Finalizado</option>
            <option value="archived">Archivado</option>
          </select>
        </label>
        <label>Visibilidad
          <select [(ngModel)]="form.visibility">
            <option value="private">Privado</option>
            <option value="public">Público</option>
          </select>
        </label>
        <label>Fecha inicio<input type="date" [(ngModel)]="form.start_date" /></label>
        <label>Fecha fin<input type="date" [(ngModel)]="form.end_date" /></label>
        <label class="full">Descripción<textarea [(ngModel)]="form.description"></textarea></label>
        <label class="full">Objetivos<textarea [(ngModel)]="form.objectives"></textarea></label>
      </div>
      <div class="actions">
        <button class="btn" (click)="save()" [disabled]="saving()">Guardar</button>
        <button class="btn ghost" (click)="closeForm()">Cancelar</button>
      </div>
    </div>
  }

  @if (loading()) { <p>Cargando…</p> }
  <div class="cards">
    @for (c of courses(); track c.id) {
      <div class="course-card glass-panel">
        <div class="cover" [style.backgroundImage]="'linear-gradient(135deg,#2563eb,#7c3aed)'"></div>
        <div class="body">
          <h3>{{ c.name }}</h3>
          <p class="meta">{{ c.code }} · {{ c.level }} · {{ c.duration_hours }}h</p>
          <p class="status">{{ c.status }} · {{ c.visibility }}</p>
          <p class="desc">{{ c.description }}</p>
          <div class="acts">
            <a [routerLink]="['/app/courses', c.id]" class="btn ghost">Ver detalle</a>
            <button (click)="edit(c)">Editar</button>
            <button class="danger" (click)="remove(c)">Eliminar</button>
          </div>
        </div>
      </div>
    } @empty {
      <p>Sin cursos.</p>
    }
  </div>
  `,
  styles: [`
    .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .toolbar { display:flex; gap:12px; margin-bottom:16px; }
    .toolbar input, .toolbar select { padding:8px 12px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .card { padding:16px; margin-bottom:16px; }
    .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
    .grid2 label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--text-secondary); }
    .grid2 input, .grid2 select, .grid2 textarea { padding:8px 10px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .full { grid-column:1/-1; }
    .actions { display:flex; gap:10px; margin-top:12px; }
    .btn { padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); cursor:pointer; }
    .btn.primary { background:var(--primary-500); color:#fff; border-color:var(--primary-500); }
    .btn.ghost { background:transparent; }
    .btn.danger { color:var(--error-300); }
    .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
    .course-card { border-radius:12px; overflow:hidden; }
    .cover { height:80px; }
    .body { padding:12px; }
    .meta { font-size:12px; color:var(--text-muted); }
    .status { font-size:12px; color:var(--primary-300); }
    .desc { font-size:13px; color:var(--text-secondary); }
    .acts { display:flex; gap:8px; margin-top:8px; }
    .acts button { padding:6px 10px; border-radius:6px; border:1px solid var(--line); background:var(--surface); cursor:pointer; font-size:12px; }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); border-radius:12px; }
  `],
})
export class CoursesComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly toast = inject(ToastService);

  readonly courses = signal<any[]>([]);
  readonly categories = signal<any[]>([]);
  readonly loading = signal(false);
  readonly showForm = signal(false);
  readonly editing = signal<any>(null);
  readonly saving = signal(false);

  search = '';
  statusFilter = '';

  form: any = { code: '', name: '', description: '', objectives: '', category_id: '', level: 'Básico', duration_hours: 20, status: 'draft', visibility: 'private', start_date: '', end_date: '' };

  ngOnInit(): void { this.load(); this.api.categories().subscribe({ next: (d) => this.categories.set(d) }); }

  load(): void {
    this.loading.set(true);
    this.api.courses({ status: this.statusFilter || undefined, search: this.search || undefined }).subscribe({
      next: (d) => { this.courses.set(d); this.loading.set(false); },
      error: (e) => { this.toast.error(e); this.loading.set(false); },
    });
  }

  openForm(): void { this.editing.set(null); this.form = { code: '', name: '', description: '', objectives: '', category_id: '', level: 'Básico', duration_hours: 20, status: 'draft', visibility: 'private', start_date: '', end_date: '' }; this.showForm.set(true); }
  edit(c: any): void {
    this.editing.set(c);
    this.form = { code: c.code, name: c.name, description: c.description, objectives: c.objectives, category_id: c.category_id, level: c.level, duration_hours: c.duration_hours, status: c.status, visibility: c.visibility, start_date: c.start_date, end_date: c.end_date };
    this.showForm.set(true);
  }
  closeForm(): void { this.showForm.set(false); this.editing.set(null); }

  save(): void {
    this.saving.set(true);
    const payload: any = { ...this.form };
    if (!payload.category_id) payload.category_id = null;
    if (!payload.start_date) payload.start_date = null;
    if (!payload.end_date) payload.end_date = null;
    const obs = this.editing()
      ? this.api.updateCourse(this.editing().id, payload)
      : this.api.createCourse(payload);
    obs.subscribe({
      next: () => { this.toast.ok('Guardado'); this.closeForm(); this.load(); this.saving.set(false); },
      error: (e) => { this.toast.error(e); this.saving.set(false); },
    });
  }

  remove(c: any): void {
    if (!confirm(`¿Eliminar ${c.name}?`)) return;
    this.api.deleteCourse(c.id).subscribe({ next: () => { this.toast.ok('Eliminado'); this.load(); }, error: (e) => this.toast.error(e) });
  }
}
