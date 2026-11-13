import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademicService } from '../../../core/academic/academic.service';
import { SessionService } from '../../../core/v1/session.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-announcements',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="head">
    <h1>Avisos</h1>
    <button class="btn primary" (click)="showForm.set(true)">+ Nuevo aviso</button>
  </div>

  @if (showForm()) {
    <div class="card glass-panel form">
      <div class="grid2">
        <label class="full">Título<input [(ngModel)]="form.title" /></label>
        <label class="full">Contenido<textarea [(ngModel)]="form.content"></textarea></label>
        <label>Aula (opcional)
          <select [(ngModel)]="form.classroom_id"><option value="">General</option>@for(c of classrooms();track c.id){<option [value]="c.id">{{c.name}}</option>}</select>
        </label>
        <label>Curso (opcional)
          <select [(ngModel)]="form.course_id"><option value="">General</option>@for(c of courses();track c.id){<option [value]="c.id">{{c.name}}</option>}</select>
        </label>
        <label class="chk"><input type="checkbox" [(ngModel)]="form.pinned" /> Fijado</label>
      </div>
      <div class="actions">
        <button class="btn" (click)="save()" [disabled]="saving()">Publicar</button>
        <button class="btn ghost" (click)="showForm.set(false)">Cancelar</button>
      </div>
    </div>
  }

  @if (loading()) { <p>Cargando…</p> }
  <div class="list">
    @for (a of announcements(); track a.id) {
      <div class="item glass-panel">
        <div class="top"><strong>{{ a.title }}</strong> @if (a.pinned) { <span class="pin">📌</span> } <small>{{ a.published_at }}</small></div>
        <p>{{ a.content }}</p>
        <button class="danger" (click)="remove(a)">Eliminar</button>
      </div>
    } @empty { <p>Sin avisos.</p> }
  </div>
  `,
  styles: [`
    .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .card { padding:16px; margin-bottom:16px; }
    .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
    .grid2 label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--text-secondary); }
    .grid2 input, .grid2 select, .grid2 textarea { padding:8px 10px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .full { grid-column:1/-1; }
    .chk { flex-direction:row !important; align-items:center; gap:8px; }
    .actions { display:flex; gap:10px; margin-top:12px; }
    .btn { padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); cursor:pointer; }
    .btn.primary { background:var(--primary-500); color:#fff; border-color:var(--primary-500); }
    .btn.ghost { background:transparent; }
    .list { display:flex; flex-direction:column; gap:12px; }
    .item { padding:14px; border-radius:12px; }
    .top { display:flex; gap:8px; align-items:center; }
    .pin { font-size:12px; }
    .danger { color:var(--error-300); background:none; border:1px solid var(--line); padding:4px 8px; border-radius:6px; cursor:pointer; margin-top:8px; }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class AnnouncementsComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly toast = inject(ToastService);
  private readonly session = inject(SessionService);

  readonly announcements = signal<any[]>([]);
  readonly classrooms = signal<any[]>([]);
  readonly courses = signal<any[]>([]);
  readonly loading = signal(false);
  readonly showForm = signal(false);
  readonly saving = signal(false);

  form: any = { title: '', content: '', classroom_id: '', course_id: '', pinned: false };

  ngOnInit(): void {
    this.load();
    this.api.classrooms().subscribe({ next: (d) => this.classrooms.set(d) });
    this.api.courses().subscribe({ next: (d) => this.courses.set(d) });
  }

  load(): void {
    this.loading.set(true);
    this.api.announcements().subscribe({ next: (d) => { this.announcements.set(d); this.loading.set(false); }, error: (e) => { this.toast.error(e); this.loading.set(false); } });
  }

  save(): void {
    this.saving.set(true);
    const payload: any = { ...this.form };
    if (!payload.classroom_id) payload.classroom_id = null;
    if (!payload.course_id) payload.course_id = null;
    this.api.createAnnouncement(payload).subscribe({ next: () => { this.toast.ok('Publicado'); this.showForm.set(false); this.form = { title: '', content: '', classroom_id: '', course_id: '', pinned: false }; this.load(); this.saving.set(false); }, error: (e) => { this.toast.error(e); this.saving.set(false); } });
  }

  remove(a: any): void {
    if (!confirm('¿Eliminar aviso?')) return;
    this.api.deleteAnnouncement(a.id).subscribe({ next: () => { this.toast.ok('Eliminado'); this.load(); }, error: (e) => this.toast.error(e) });
  }
}
