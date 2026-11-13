import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademicService } from '../../../core/academic/academic.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-grades',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="head">
    <h1>Calificaciones</h1>
    <button class="btn primary" (click)="openForm()">+ Nueva calificación</button>
  </div>

  <div class="toolbar">
    <select [(ngModel)]="filterClassroom" (ngModelChange)="load()">
      <option value="">Todas las aulas</option>
      @for (c of classrooms(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
    </select>
    <select [(ngModel)]="filterStudent" (ngModelChange)="load()">
      <option value="">Todos los estudiantes</option>
      @for (s of students(); track s.id) { <option [value]="s.id">{{ s.full_name }}</option> }
    </select>
  </div>

  @if (showForm()) {
    <div class="card glass-panel form">
      <h3>{{ editing() ? 'Editar calificación' : 'Nueva calificación' }}</h3>
      <div class="grid2">
        <label>Estudiante
          <select [(ngModel)]="form.student_id"><option value="">Seleccione</option>@for(s of students();track s.id){<option [value]="s.id">{{s.full_name}}</option>}</select>
        </label>
        <label>Aula
          <select [(ngModel)]="form.classroom_id"><option value="">Seleccione</option>@for(c of classrooms();track c.id){<option [value]="c.id">{{c.name}}</option>}</select>
        </label>
        <label>Evaluación<input [(ngModel)]="form.assessment_name" /></label>
        <label>Calificación<input type="number" [(ngModel)]="form.score" /></label>
        <label>Máximo<input type="number" [(ngModel)]="form.max_score" /></label>
        <label class="full">Observaciones<textarea [(ngModel)]="form.observations"></textarea></label>
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
      <thead><tr><th>Estudiante</th><th>Aula</th><th>Evaluación</th><th>Nota</th><th>Máx</th><th>Observaciones</th><th></th></tr></thead>
      <tbody>
        @for (g of grades(); track g.id) {
          <tr>
            <td>{{ studentName(g.student_id) }}</td>
            <td>{{ classroomName(g.classroom_id) }}</td>
            <td>{{ g.assessment_name }}</td>
            <td>{{ g.score }}</td>
            <td>{{ g.max_score }}</td>
            <td>{{ g.observations }}</td>
            <td class="acts">
              <button (click)="edit(g)">Editar</button>
              <button class="danger" (click)="remove(g)">Eliminar</button>
            </td>
          </tr>
        } @empty { <tr><td colspan="7">Sin calificaciones.</td></tr> }
      </tbody>
    </table>
  </div>
  `,
  styles: [`
    .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .toolbar { display:flex; gap:12px; margin-bottom:16px; }
    .toolbar select { padding:8px 12px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .card { padding:16px; margin-bottom:16px; }
    .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
    .grid2 label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--text-secondary); }
    .grid2 input, .grid2 select, .grid2 textarea { padding:8px 10px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .full { grid-column:1/-1; }
    .actions { display:flex; gap:10px; margin-top:12px; }
    .btn { padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); cursor:pointer; }
    .btn.primary { background:var(--primary-500); color:#fff; border-color:var(--primary-500); }
    .btn.ghost { background:transparent; }
    .table-wrap { overflow:auto; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--line); }
    .acts { display:flex; gap:6px; }
    .acts button { padding:4px 8px; border-radius:6px; border:1px solid var(--line); background:var(--surface); cursor:pointer; font-size:12px; }
    .danger { color:var(--error-300); }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); border-radius:12px; }
  `],
})
export class GradesComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly toast = inject(ToastService);

  readonly grades = signal<any[]>([]);
  readonly classrooms = signal<any[]>([]);
  readonly students = signal<any[]>([]);
  readonly loading = signal(false);
  readonly showForm = signal(false);
  readonly editing = signal<any>(null);
  readonly saving = signal(false);

  filterClassroom = '';
  filterStudent = '';
  form: any = { student_id: '', classroom_id: '', assessment_name: '', score: 0, max_score: 100, observations: '' };

  ngOnInit(): void {
    this.load();
    this.api.classrooms().subscribe({ next: (d) => this.classrooms.set(d) });
    this.api.students().subscribe({ next: (d) => this.students.set(d) });
  }

  load(): void {
    this.loading.set(true);
    this.api.grades({ classroom_id: this.filterClassroom || undefined, student_id: this.filterStudent || undefined }).subscribe({
      next: (d) => { this.grades.set(d); this.loading.set(false); },
      error: (e) => { this.toast.error(e); this.loading.set(false); },
    });
  }

  classroomName(id: string): string { return this.classrooms().find((c) => c.id === id)?.name ?? id; }
  studentName(id: string): string { return this.students().find((s) => s.id === id)?.full_name ?? id; }

  openForm(): void { this.editing.set(null); this.form = { student_id: '', classroom_id: '', assessment_name: '', score: 0, max_score: 100, observations: '' }; this.showForm.set(true); }
  edit(g: any): void { this.editing.set(g); this.form = { student_id: g.student_id, classroom_id: g.classroom_id, assessment_name: g.assessment_name, score: g.score, max_score: g.max_score, observations: g.observations }; this.showForm.set(true); }
  closeForm(): void { this.showForm.set(false); this.editing.set(null); }

  save(): void {
    this.saving.set(true);
    const obs = this.editing()
      ? this.api.updateGrade(this.editing().id, { score: this.form.score, max_score: this.form.max_score, observations: this.form.observations, assessment_name: this.form.assessment_name })
      : this.api.createGrade(this.form);
    obs.subscribe({ next: () => { this.toast.ok('Guardado'); this.closeForm(); this.load(); this.saving.set(false); }, error: (e) => { this.toast.error(e); this.saving.set(false); } });
  }

  remove(g: any): void {
    if (!confirm('¿Eliminar calificación?')) return;
    this.api.deleteGrade(g.id).subscribe({ next: () => { this.toast.ok('Eliminada'); this.load(); }, error: (e) => this.toast.error(e) });
  }
}
