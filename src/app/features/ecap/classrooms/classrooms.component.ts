import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AcademicService } from '../../../core/academic/academic.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-classrooms',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
  <div class="head">
    <h1>Aulas de capacitación</h1>
    <button class="btn primary" (click)="openForm()">+ Nueva aula</button>
  </div>

  <div class="toolbar">
    <select [(ngModel)]="courseFilter" (ngModelChange)="load()">
      <option value="">Todos los cursos</option>
      @for (c of courses(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
    </select>
  </div>

  @if (showForm()) {
    <div class="card glass-panel form">
      <h3>{{ editing() ? 'Editar aula' : 'Nueva aula' }}</h3>
      <div class="grid2">
        <label>Curso
          <select [(ngModel)]="form.course_id">
            @for (c of courses(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>
        </label>
        <label>Nombre<input [(ngModel)]="form.name" /></label>
        <label>Maestro
          <select [(ngModel)]="form.teacher_id">
            <option value="">Sin asignar</option>
            @for (t of teachers(); track t.id) { <option [value]="t.id">{{ t.full_name }}</option> }
          </select>
        </label>
        <label>Modalidad
          <select [(ngModel)]="form.modality">
            <option value="presencial">Presencial</option>
            <option value="virtual">Virtual</option>
            <option value="hibrida">Híbrida</option>
          </select>
        </label>
        <label>Cupo máximo<input type="number" [(ngModel)]="form.max_capacity" /></label>
        <label>Estado
          <select [(ngModel)]="form.status">
            <option value="active">Activa</option>
            <option value="finished">Finalizada</option>
            <option value="archived">Archivada</option>
          </select>
        </label>
        <label>Inicio<input type="date" [(ngModel)]="form.start_date" /></label>
        <label>Fin<input type="date" [(ngModel)]="form.end_date" /></label>
        <label>Enlace de reunión<input [(ngModel)]="form.meeting_link" /></label>
        <label class="full">Descripción<textarea [(ngModel)]="form.description"></textarea></label>
      </div>
      <div class="actions">
        <button class="btn" (click)="save()" [disabled]="saving()">Guardar</button>
        <button class="btn ghost" (click)="closeForm()">Cancelar</button>
      </div>
    </div>
  }

  @if (loading()) { <p>Cargando…</p> }
  <div class="table-wrap glass-panel">
    <table>
      <thead><tr><th>Aula</th><th>Curso</th><th>Maestro</th><th>Modalidad</th><th>Cupo</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        @for (r of classrooms(); track r.id) {
          <tr>
            <td>{{ r.name }}</td>
            <td>{{ courseName(r.course_id) }}</td>
            <td>{{ teacherName(r.teacher_id) }}</td>
            <td>{{ r.modality }}</td>
            <td>{{ r.max_capacity }}</td>
            <td>{{ r.status }}</td>
            <td class="acts">
              <a [routerLink]="['/app/content']" [queryParams]="{classroom:r.id}" class="btn ghost">Contenidos</a>
              <button (click)="edit(r)">Editar</button>
              <button class="danger" (click)="remove(r)">Eliminar</button>
            </td>
          </tr>
        } @empty { <tr><td colspan="7">Sin aulas.</td></tr> }
      </tbody>
    </table>
  </div>
  `,
  styles: [`
    .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .toolbar { margin-bottom:16px; }
    .toolbar select { padding:8px 12px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .card { padding:16px; margin-bottom:16px; }
    .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
    .grid2 label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--text-secondary); }
    .grid2 input, .grid2 select, .grid2 textarea { padding:8px 10px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .full { grid-column:1/-1; }
    .actions { display:flex; gap:10px; margin-top:12px; }
    .btn { padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); cursor:pointer; text-decoration:none; }
    .btn.primary { background:var(--primary-500); color:#fff; border-color:var(--primary-500); }
    .btn.ghost { background:transparent; }
    .btn.danger { color:var(--error-300); }
    .table-wrap { overflow:auto; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--line); }
    .acts { display:flex; gap:6px; }
    .acts button, .acts a { padding:4px 8px; border-radius:6px; border:1px solid var(--line); background:var(--surface); cursor:pointer; font-size:12px; }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); border-radius:12px; }
  `],
})
export class ClassroomsComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly toast = inject(ToastService);

  readonly classrooms = signal<any[]>([]);
  readonly courses = signal<any[]>([]);
  readonly teachers = signal<any[]>([]);
  readonly loading = signal(false);
  readonly showForm = signal(false);
  readonly editing = signal<any>(null);
  readonly saving = signal(false);

  courseFilter = '';
  form: any = { course_id: '', name: '', description: '', teacher_id: '', start_date: '', end_date: '', max_capacity: 25, status: 'active', modality: 'presencial', meeting_link: '' };

  ngOnInit(): void {
    this.load();
    this.api.courses().subscribe({ next: (d) => this.courses.set(d) });
    this.api.teachers().subscribe({ next: (d) => this.teachers.set(d) });
  }

  load(): void {
    this.loading.set(true);
    this.api.classrooms({ course_id: this.courseFilter || undefined }).subscribe({
      next: (d) => { this.classrooms.set(d); this.loading.set(false); },
      error: (e) => { this.toast.error(e); this.loading.set(false); },
    });
  }

  courseName(id: string): string { return this.courses().find((c) => c.id === id)?.name ?? id; }
  teacherName(id: string): string { return this.teachers().find((t) => t.id === id)?.full_name ?? '—'; }

  openForm(): void { this.editing.set(null); this.form = { course_id: this.courses()[0]?.id ?? '', name: '', description: '', teacher_id: '', start_date: '', end_date: '', max_capacity: 25, status: 'active', modality: 'presencial', meeting_link: '' }; this.showForm.set(true); }
  edit(r: any): void { this.editing.set(r); this.form = { ...r, teacher_id: r.teacher_id ?? '', start_date: r.start_date ?? '', end_date: r.end_date ?? '' }; this.showForm.set(true); }
  closeForm(): void { this.showForm.set(false); this.editing.set(null); }

  save(): void {
    this.saving.set(true);
    const payload: any = { ...this.form };
    if (!payload.teacher_id) payload.teacher_id = null;
    if (!payload.start_date) payload.start_date = null;
    if (!payload.end_date) payload.end_date = null;
    const obs = this.editing() ? this.api.updateClassroom(this.editing().id, payload) : this.api.createClassroom(payload);
    obs.subscribe({ next: () => { this.toast.ok('Guardado'); this.closeForm(); this.load(); this.saving.set(false); }, error: (e) => { this.toast.error(e); this.saving.set(false); } });
  }

  remove(r: any): void {
    if (!confirm(`¿Eliminar ${r.name}?`)) return;
    this.api.deleteClassroom(r.id).subscribe({ next: () => { this.toast.ok('Eliminado'); this.load(); }, error: (e) => this.toast.error(e) });
  }
}
