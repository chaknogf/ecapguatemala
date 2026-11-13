import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademicService } from '../../../core/academic/academic.service';
import { SessionService } from '../../../core/v1/session.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="head">
    <h1>Usuarios</h1>
    <button class="btn primary" (click)="openForm()">+ Nuevo usuario</button>
  </div>

  <div class="toolbar">
    <input placeholder="Buscar por nombre o correo" [(ngModel)]="search" (ngModelChange)="load()" />
    <select [(ngModel)]="roleFilter" (ngModelChange)="load()">
      <option value="">Todos los roles</option>
      <option value="admin">Administrador</option>
      <option value="editor">Editor</option>
      <option value="teacher">Maestro</option>
      <option value="student">Estudiante</option>
    </select>
  </div>

  @if (showForm()) {
    <div class="card glass-panel form">
      <h3>{{ editing() ? 'Editar usuario' : 'Nuevo usuario' }}</h3>
      <div class="grid2">
        <label>Nombre completo<input [(ngModel)]="form.full_name" /></label>
        <label>Correo<input [(ngModel)]="form.email" [disabled]="!!editing()" /></label>
        <label>Teléfono<input [(ngModel)]="form.phone" /></label>
        <label>Rol
          <select [(ngModel)]="form.role_code">
            <option value="admin">Administrador</option>
            <option value="editor">Editor</option>
            <option value="teacher">Maestro</option>
            <option value="student">Estudiante</option>
          </select>
        </label>
        @if (!editing()) {
          <label>Contraseña<input type="password" [(ngModel)]="form.password" /></label>
        }
        <label class="chk"><input type="checkbox" [(ngModel)]="form.active" /> Activo</label>
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
      <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        @for (u of users(); track u.id) {
          <tr>
            <td>{{ u.full_name }}</td>
            <td>{{ u.email }}</td>
            <td>{{ u.role_code }}</td>
            <td>{{ u.active ? 'Activo' : 'Inactivo' }}</td>
            <td class="acts">
              <button (click)="edit(u)">Editar</button>
              <button (click)="toggle(u)">{{ u.active ? 'Desactivar' : 'Activar' }}</button>
              <button class="danger" (click)="remove(u)">Eliminar</button>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="5">Sin usuarios.</td></tr>
        }
      </tbody>
    </table>
  </div>
  `,
  styles: [`
    .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
    .toolbar { display:flex; gap:12px; margin-bottom:16px; }
    .toolbar input, .toolbar select { padding:8px 12px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .form { padding:16px; margin-bottom:16px; }
    .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
    .grid2 label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--text-secondary); }
    .grid2 input, .grid2 select { padding:8px 10px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .chk { flex-direction:row !important; align-items:center; gap:8px; }
    .actions { display:flex; gap:10px; margin-top:12px; }
    .btn { padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); cursor:pointer; }
    .btn.primary { background:var(--primary-500); color:#fff; border-color:var(--primary-500); }
    .btn.ghost { background:transparent; }
    .btn.danger { color:var(--error-300); }
    .table-wrap { overflow:auto; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--line); }
    .acts { display:flex; gap:6px; }
    .acts button { padding:4px 8px; border-radius:6px; border:1px solid var(--line); background:var(--surface); cursor:pointer; font-size:12px; }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); border-radius:12px; }
  `],
})
export class UsersComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly toast = inject(ToastService);

  readonly users = signal<any[]>([]);
  readonly loading = signal(false);
  readonly showForm = signal(false);
  readonly editing = signal<any>(null);
  readonly saving = signal(false);

  search = '';
  roleFilter = '';

  form: any = { full_name: '', email: '', phone: '', role_code: 'student', password: '', active: true };

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.users({ search: this.search || undefined, role: this.roleFilter || undefined }).subscribe({
      next: (d) => { this.users.set(d); this.loading.set(false); },
      error: (e) => { this.toast.error(e); this.loading.set(false); },
    });
  }

  openForm(): void {
    this.editing.set(null);
    this.form = { full_name: '', email: '', phone: '', role_code: 'student', password: '', active: true };
    this.showForm.set(true);
  }

  edit(u: any): void {
    this.editing.set(u);
    this.form = { full_name: u.full_name, email: u.email, phone: u.phone, role_code: u.role_code, password: '', active: u.active };
    this.showForm.set(true);
  }

  closeForm(): void { this.showForm.set(false); this.editing.set(null); }

  save(): void {
    this.saving.set(true);
    const e = this.editing();
    const obs = e
      ? this.api.updateUser(e.id, { full_name: this.form.full_name, phone: this.form.phone, role_code: this.form.role_code, active: this.form.active, password: this.form.password || undefined })
      : this.api.createUser({ email: this.form.email, full_name: this.form.full_name, password: this.form.password, role_code: this.form.role_code, phone: this.form.phone, active: this.form.active });
    obs.subscribe({
      next: () => { this.toast.ok('Guardado'); this.closeForm(); this.load(); this.saving.set(false); },
      error: (err) => { this.toast.error(err); this.saving.set(false); },
    });
  }

  toggle(u: any): void {
    this.api.updateUser(u.id, { active: !u.active }).subscribe({
      next: () => { this.toast.ok('Actualizado'); this.load(); },
      error: (e) => this.toast.error(e),
    });
  }

  remove(u: any): void {
    if (!confirm(`¿Eliminar a ${u.full_name}?`)) return;
    this.api.deleteUser(u.id).subscribe({
      next: () => { this.toast.ok('Eliminado'); this.load(); },
      error: (e) => this.toast.error(e),
    });
  }
}
