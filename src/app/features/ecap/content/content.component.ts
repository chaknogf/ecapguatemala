import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AcademicService } from '../../../core/academic/academic.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-content',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="head">
    <h1>Gestión de contenidos</h1>
  </div>

  <div class="toolbar">
    <label>Aula
      <select [(ngModel)]="classroomId" (ngModelChange)="onClassroomChange()">
        <option value="">Seleccione un aula</option>
        @for (c of classrooms(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
      </select>
    </label>
  </div>

  @if (classroomId) {
    <div class="grid">
      <div class="col glass-panel">
        <div class="colhead"><h3>Unidades</h3><button (click)="openUnit()">+ Unidad</button></div>
        @if (showUnitForm()) {
          <div class="mini">
            <input placeholder="Título" [(ngModel)]="unitForm.title" />
            <textarea placeholder="Descripción" [(ngModel)]="unitForm.description"></textarea>
            <select [(ngModel)]="unitForm.status"><option value="draft">Borrador</option><option value="published">Publicado</option></select>
            <div class="miniacts">
              <button (click)="saveUnit()">Guardar</button>
              <button (click)="showUnitForm.set(false)">Cancelar</button>
            </div>
          </div>
        }
        <ul class="list">
          @for (u of units(); track u.id) {
            <li [class.active]="selectedUnit()?.id === u.id">
              <button (click)="selectUnit(u)">{{ u.order_index }}. {{ u.title }}</button>
              <span class="status">{{ u.status }}</span>
              <button class="small" (click)="moveUnit(u,-1)">↑</button>
              <button class="small" (click)="moveUnit(u,1)">↓</button>
              <button class="small danger" (click)="deleteUnit(u)">×</button>
            </li>
          }
        </ul>
      </div>

      <div class="col glass-panel">
        <div class="colhead"><h3>Lecciones</h3><button [disabled]="!selectedUnit()" (click)="openLesson()">+ Lección</button></div>
        @if (showLessonForm()) {
          <div class="mini">
            <input placeholder="Título" [(ngModel)]="lessonForm.title" />
            <textarea placeholder="Descripción" [(ngModel)]="lessonForm.description"></textarea>
            <select [(ngModel)]="lessonForm.content_type"><option value="text">Texto</option><option value="video">Video</option><option value="document">Documento</option></select>
            <select [(ngModel)]="lessonForm.status"><option value="draft">Borrador</option><option value="published">Publicado</option></select>
            <div class="miniacts">
              <button (click)="saveLesson()">Guardar</button>
              <button (click)="showLessonForm.set(false)">Cancelar</button>
            </div>
          </div>
        }
        <ul class="list">
          @for (l of lessons(); track l.id) {
            <li [class.active]="selectedLesson()?.id === l.id">
              <button (click)="selectLesson(l)">{{ l.order_index }}. {{ l.title }}</button>
              <span class="status">{{ l.status }}</span>
              <button class="small" (click)="moveLesson(l,-1)">↑</button>
              <button class="small" (click)="moveLesson(l,1)">↓</button>
              <button class="small danger" (click)="deleteLesson(l)">×</button>
            </li>
          }
        </ul>
      </div>

      <div class="col glass-panel">
        <div class="colhead"><h3>Recursos</h3><button [disabled]="!selectedLesson()" (click)="openResource()">+ Recurso</button></div>
        @if (showResourceForm()) {
          <div class="mini">
            <input placeholder="Título" [(ngModel)]="resourceForm.title" />
            <select [(ngModel)]="resourceForm.type"><option value="text">Texto</option><option value="video">Video</option><option value="pdf">PDF</option><option value="document">Documento</option><option value="image">Imagen</option><option value="link">Enlace</option></select>
            <input placeholder="URL" [(ngModel)]="resourceForm.url" />
            <input placeholder="Nombre de archivo" [(ngModel)]="resourceForm.file_name" />
            <select [(ngModel)]="resourceForm.visibility"><option value="draft">Borrador</option><option value="published">Publicado</option></select>
            <div class="miniacts">
              <button (click)="saveResource()">Guardar</button>
              <button (click)="showResourceForm.set(false)">Cancelar</button>
            </div>
          </div>
        }
        <ul class="list">
          @for (r of resources(); track r.id) {
            <li>
              <span>{{ r.title }} ({{ r.type }})</span>
              <button class="small danger" (click)="deleteResource(r)">×</button>
            </li>
          }
        </ul>
      </div>
    </div>
  }
  `,
  styles: [`
    .head { margin-bottom:16px; }
    .toolbar { margin-bottom:16px; }
    .toolbar select { padding:8px 12px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
    .col { padding:12px; border-radius:12px; }
    .colhead { display:flex; justify-content:space-between; align-items:center; }
    .colhead button { padding:6px 10px; border-radius:6px; border:1px solid var(--line); background:var(--surface); cursor:pointer; }
    .list { list-style:none; padding:0; margin:12px 0; }
    .list li { display:flex; align-items:center; gap:6px; padding:6px 4px; border-bottom:1px solid var(--line); }
    .list li.active { background:var(--primary-soft); }
    .list li button { background:none; border:none; cursor:pointer; color:var(--text-primary); text-align:left; flex:1; }
    .small { padding:2px 6px !important; font-size:11px; }
    .danger { color:var(--error-300); }
    .mini { display:flex; flex-direction:column; gap:6px; margin:8px 0; }
    .mini input, .mini textarea, .mini select { padding:6px 8px; border-radius:6px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .miniacts { display:flex; gap:6px; }
    .status { font-size:11px; color:var(--text-muted); }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class ContentComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  readonly classrooms = signal<any[]>([]);
  readonly units = signal<any[]>([]);
  readonly lessons = signal<any[]>([]);
  readonly resources = signal<any[]>([]);
  readonly selectedUnit = signal<any>(null);
  readonly selectedLesson = signal<any>(null);

  readonly showUnitForm = signal(false);
  readonly showLessonForm = signal(false);
  readonly showResourceForm = signal(false);

  classroomId = '';
  unitForm: any = { classroom_id: '', title: '', description: '', order_index: 0, status: 'draft' };
  lessonForm: any = { unit_id: '', title: '', description: '', content_type: 'text', order_index: 0, status: 'draft' };
  resourceForm: any = { lesson_id: null, classroom_id: null, course_id: null, title: '', type: 'document', url: '', file_name: '', visibility: 'published', order_index: 0 };

  ngOnInit(): void {
    this.api.classrooms().subscribe({ next: (d) => {
      this.classrooms.set(d);
      const qp = this.route.snapshot.queryParamMap.get('classroom');
      if (qp) { this.classroomId = qp; this.onClassroomChange(); }
    }});
  }

  onClassroomChange(): void {
    this.units.set([]); this.lessons.set([]); this.resources.set([]); this.selectedUnit.set(null); this.selectedLesson.set(null);
    if (!this.classroomId) return;
    this.api.units(this.classroomId).subscribe({ next: (d) => this.units.set(d) });
  }

  selectUnit(u: any): void {
    this.selectedUnit.set(u);
    this.selectedLesson.set(null);
    this.lessons.set([]);
    this.resources.set([]);
    this.api.lessons(u.id).subscribe({ next: (d) => this.lessons.set(d) });
    this.api.resources({ classroom_id: this.classroomId }).subscribe({ next: (d) => this.resources.set(d.filter((r: any) => !r.lesson_id)) });
  }

  selectLesson(l: any): void {
    this.selectedLesson.set(l);
    this.api.resources({ lesson_id: l.id }).subscribe({ next: (d) => this.resources.set(d) });
  }

  openUnit(): void { this.unitForm = { classroom_id: this.classroomId, title: '', description: '', order_index: this.units().length, status: 'draft' }; this.showUnitForm.set(true); }
  saveUnit(): void {
    const obs = this.api.createUnit(this.unitForm);
    obs.subscribe({ next: () => { this.toast.ok('Unidad creada'); this.showUnitForm.set(false); this.onClassroomChange(); }, error: (e) => this.toast.error(e) });
  }
  deleteUnit(u: any): void {
    if (!confirm('¿Eliminar unidad?')) return;
    this.api.deleteUnit(u.id).subscribe({ next: () => { this.toast.ok('Eliminada'); this.onClassroomChange(); }, error: (e) => this.toast.error(e) });
  }
  moveUnit(u: any, delta: number): void {
    const idx = this.units().findIndex((x) => x.id === u.id);
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= this.units().length) return;
    const reordered = [...this.units()];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);
    reordered.forEach((x, i) => this.api.updateUnit(x.id, { order_index: i }).subscribe());
    this.units.set(reordered);
  }

  openLesson(): void { this.lessonForm = { unit_id: this.selectedUnit()?.id, title: '', description: '', content_type: 'text', order_index: this.lessons().length, status: 'draft' }; this.showLessonForm.set(true); }
  saveLesson(): void {
    this.api.createLesson(this.lessonForm).subscribe({ next: () => { this.toast.ok('Lección creada'); this.showLessonForm.set(false); if (this.selectedUnit()) this.selectUnit(this.selectedUnit()); }, error: (e) => this.toast.error(e) });
  }
  deleteLesson(l: any): void {
    if (!confirm('¿Eliminar lección?')) return;
    this.api.deleteLesson(l.id).subscribe({ next: () => { this.toast.ok('Eliminada'); if (this.selectedUnit()) this.selectUnit(this.selectedUnit()); }, error: (e) => this.toast.error(e) });
  }
  moveLesson(l: any, delta: number): void {
    const idx = this.lessons().findIndex((x) => x.id === l.id);
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= this.lessons().length) return;
    const reordered = [...this.lessons()];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);
    reordered.forEach((x, i) => this.api.updateLesson(x.id, { order_index: i }).subscribe());
    this.lessons.set(reordered);
  }

  openResource(): void { this.resourceForm = { lesson_id: this.selectedLesson()?.id ?? null, classroom_id: this.selectedLesson() ? null : this.classroomId, course_id: null, title: '', type: 'document', url: '', file_name: '', visibility: 'published', order_index: this.resources().length }; this.showResourceForm.set(true); }
  saveResource(): void {
    this.api.createResource(this.resourceForm).subscribe({ next: () => { this.toast.ok('Recurso creado'); this.showResourceForm.set(false); if (this.selectedLesson()) this.selectLesson(this.selectedLesson()); else this.selectUnit(this.selectedUnit()); }, error: (e) => this.toast.error(e) });
  }
  deleteResource(r: any): void {
    if (!confirm('¿Eliminar recurso?')) return;
    this.api.deleteResource(r.id).subscribe({ next: () => { this.toast.ok('Eliminado'); if (this.selectedLesson()) this.selectLesson(this.selectedLesson()); else if (this.selectedUnit()) this.selectUnit(this.selectedUnit()); }, error: (e) => this.toast.error(e) });
  }
}
