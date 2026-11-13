import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademicService } from '../../../core/academic/academic.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-landing-manage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="head"><h1>Gestión de landing page</h1></div>
  <div class="tabs">
    <button [class.active]="tab()==='sections'" (click)="tab.set('sections')">Secciones</button>
    <button [class.active]="tab()==='pubs'" (click)="tab.set('pubs')">Publicaciones</button>
    <button [class.active]="tab()==='news'" (click)="tab.set('news')">Noticias</button>
  </div>

  @if (tab()==='sections') {
    <div class="panel glass-panel">
      <button class="btn primary" (click)="openSection()">+ Sección</button>
      @if (showSectionForm()) {
        <div class="form">
          <label>Clave<input [(ngModel)]="sectionForm.key" [disabled]="!!editingSection()" /></label>
          <label>Título<input [(ngModel)]="sectionForm.title" /></label>
          <label>Contenido<textarea [(ngModel)]="sectionForm.content"></textarea></label>
          <label>Imagen (URL)<input [(ngModel)]="sectionForm.image_url" /></label>
          <label>Orden<input type="number" [(ngModel)]="sectionForm.sort_order" /></label>
          <label class="chk"><input type="checkbox" [(ngModel)]="sectionForm.published" /> Publicado</label>
          <div class="actions"><button (click)="saveSection()">Guardar</button><button (click)="showSectionForm.set(false)">Cancelar</button></div>
        </div>
      }
      <table>
        <thead><tr><th>Clave</th><th>Título</th><th>Contenido</th><th>Orden</th><th></th></tr></thead>
        <tbody>
          @for (s of sections(); track s.id) {
            <tr>
              <td>{{ s.key }}</td><td>{{ s.title }}</td><td>{{ s.content }}</td><td>{{ s.sort_order }}</td>
              <td class="acts">
                <button (click)="editSection(s)">Editar</button>
                <button class="danger" (click)="deleteSection(s.key)">Eliminar</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  @if (tab()==='pubs') {
    <div class="panel glass-panel">
      <button class="btn primary" (click)="openPub()">+ Publicación</button>
      @if (showPubForm()) {
        <div class="form">
          <label>Título<input [(ngModel)]="pubForm.title" /></label>
          <label>Descripción<textarea [(ngModel)]="pubForm.description"></textarea></label>
          <label>Imagen (URL)<input [(ngModel)]="pubForm.cover_image" /></label>
          <label>Enlace<input [(ngModel)]="pubForm.url" /></label>
          <label>Orden<input type="number" [(ngModel)]="pubForm.sort_order" /></label>
          <label>Estado
            <select [(ngModel)]="pubForm.status"><option value="published">Publicado</option><option value="draft">Borrador</option></select>
          </label>
          <div class="actions"><button (click)="savePub()">Guardar</button><button (click)="showPubForm.set(false)">Cancelar</button></div>
        </div>
      }
      <table>
        <thead><tr><th>Título</th><th>Estado</th><th>Orden</th><th></th></tr></thead>
        <tbody>
          @for (p of pubs(); track p.id) {
            <tr><td>{{ p.title }}</td><td>{{ p.status }}</td><td>{{ p.sort_order }}</td>
            <td class="acts"><button (click)="editPub(p)">Editar</button><button class="danger" (click)="deletePub(p.id)">Eliminar</button></td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  @if (tab()==='news') {
    <div class="panel glass-panel">
      <button class="btn primary" (click)="openNews()">+ Noticia</button>
      @if (showNewsForm()) {
        <div class="form">
          <label>Título<input [(ngModel)]="newsForm.title" /></label>
          <label>Resumen<textarea [(ngModel)]="newsForm.summary"></textarea></label>
          <label>Contenido<textarea [(ngModel)]="newsForm.content"></textarea></label>
          <label>Imagen (URL)<input [(ngModel)]="newsForm.cover_image" /></label>
          <label>Enlace<input [(ngModel)]="newsForm.url" /></label>
          <label>Orden<input type="number" [(ngModel)]="newsForm.sort_order" /></label>
          <label>Estado
            <select [(ngModel)]="newsForm.status"><option value="published">Publicado</option><option value="draft">Borrador</option></select>
          </label>
          <div class="actions"><button (click)="saveNews()">Guardar</button><button (click)="showNewsForm.set(false)">Cancelar</button></div>
        </div>
      }
      <table>
        <thead><tr><th>Título</th><th>Estado</th><th>Orden</th><th></th></tr></thead>
        <tbody>
          @for (n of news(); track n.id) {
            <tr><td>{{ n.title }}</td><td>{{ n.status }}</td><td>{{ n.sort_order }}</td>
            <td class="acts"><button (click)="editNews(n)">Editar</button><button class="danger" (click)="deleteNews(n.id)">Eliminar</button></td></tr>
          }
        </tbody>
      </table>
    </div>
  }
  `,
  styles: [`
    .head { margin-bottom:16px; }
    .tabs { display:flex; gap:8px; margin-bottom:16px; }
    .tabs button { padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:var(--surface); cursor:pointer; }
    .tabs button.active { background:var(--primary-500); color:#fff; }
    .panel { padding:16px; border-radius:12px; }
    .form { display:flex; flex-direction:column; gap:8px; margin:12px 0; }
    .form label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--text-secondary); }
    .form input, .form textarea, .form select { padding:8px 10px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .chk { flex-direction:row !important; align-items:center; gap:8px; }
    .actions { display:flex; gap:10px; }
    .btn { padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); cursor:pointer; }
    .btn.primary { background:var(--primary-500); color:#fff; border-color:var(--primary-500); }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th, td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--line); }
    .acts { display:flex; gap:6px; }
    .acts button { padding:4px 8px; border-radius:6px; border:1px solid var(--line); background:var(--surface); cursor:pointer; font-size:12px; }
    .danger { color:var(--error-300); }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class LandingManageComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly toast = inject(ToastService);

  readonly tab = signal('sections');
  readonly sections = signal<any[]>([]);
  readonly pubs = signal<any[]>([]);
  readonly news = signal<any[]>([]);

  readonly showSectionForm = signal(false);
  readonly showPubForm = signal(false);
  readonly showNewsForm = signal(false);
  readonly editingSection = signal<any>(null);
  readonly editingPub = signal<any>(null);
  readonly editingNews = signal<any>(null);

  sectionForm: any = { key: '', title: '', content: '', image_url: '', sort_order: 0, published: true };
  pubForm: any = { title: '', description: '', cover_image: '', url: '', sort_order: 0, status: 'published' };
  newsForm: any = { title: '', summary: '', content: '', cover_image: '', url: '', sort_order: 0, status: 'published' };

  ngOnInit(): void { this.loadAll(); }

  loadAll(): void {
    this.api.landingSections(false).subscribe({ next: (d) => this.sections.set(d) });
    this.api.publications(false).subscribe({ next: (d) => this.pubs.set(d) });
    this.api.news(false).subscribe({ next: (d) => this.news.set(d) });
  }

  openSection(): void { this.editingSection.set(null); this.sectionForm = { key: '', title: '', content: '', image_url: '', sort_order: 0, published: true }; this.showSectionForm.set(true); }
  editSection(s: any): void { this.editingSection.set(s); this.sectionForm = { ...s }; this.showSectionForm.set(true); }
  saveSection(): void {
    const obs = this.editingSection()
      ? this.api.updateLandingSection(this.editingSection().key, this.sectionForm)
      : this.api.createLandingSection(this.sectionForm);
    obs.subscribe({ next: () => { this.toast.ok('Guardado'); this.showSectionForm.set(false); this.loadAll(); }, error: (e) => this.toast.error(e) });
  }
  deleteSection(key: string): void {
    if (!confirm('¿Eliminar sección?')) return;
    this.api.deleteLandingSection(key).subscribe({ next: () => { this.toast.ok('Eliminada'); this.loadAll(); }, error: (e) => this.toast.error(e) });
  }

  openPub(): void { this.editingPub.set(null); this.pubForm = { title: '', description: '', cover_image: '', url: '', sort_order: 0, status: 'published' }; this.showPubForm.set(true); }
  editPub(p: any): void { this.editingPub.set(p); this.pubForm = { ...p }; this.showPubForm.set(true); }
  savePub(): void {
    const obs = this.editingPub()
      ? this.api.updatePublication(this.editingPub().id, this.pubForm)
      : this.api.createPublication(this.pubForm);
    obs.subscribe({ next: () => { this.toast.ok('Guardado'); this.showPubForm.set(false); this.loadAll(); }, error: (e) => this.toast.error(e) });
  }
  deletePub(id: string): void {
    if (!confirm('¿Eliminar publicación?')) return;
    this.api.deletePublication(id).subscribe({ next: () => { this.toast.ok('Eliminada'); this.loadAll(); }, error: (e) => this.toast.error(e) });
  }

  openNews(): void { this.editingNews.set(null); this.newsForm = { title: '', summary: '', content: '', cover_image: '', url: '', sort_order: 0, status: 'published' }; this.showNewsForm.set(true); }
  editNews(n: any): void { this.editingNews.set(n); this.newsForm = { ...n }; this.showNewsForm.set(true); }
  saveNews(): void {
    const obs = this.editingNews()
      ? this.api.updateNews(this.editingNews().id, this.newsForm)
      : this.api.createNews(this.newsForm);
    obs.subscribe({ next: () => { this.toast.ok('Guardado'); this.showNewsForm.set(false); this.loadAll(); }, error: (e) => this.toast.error(e) });
  }
  deleteNews(id: string): void {
    if (!confirm('¿Eliminar noticia?')) return;
    this.api.deleteNews(id).subscribe({ next: () => { this.toast.ok('Eliminada'); this.loadAll(); }, error: (e) => this.toast.error(e) });
  }
}
