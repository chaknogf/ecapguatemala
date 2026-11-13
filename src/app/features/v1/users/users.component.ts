import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { V1PlatformService, AdminUser, RoleInfo } from '../../../core/v1/platform.service';
import { ToastService, ConfirmModalComponent } from '../../../shared/ui';

@Component({
  selector: 'app-v1-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent implements OnInit {
  private readonly platform = inject(V1PlatformService);
  private readonly toast = inject(ToastService);
  private readonly confirm = viewChild<ConfirmModalComponent>('cm');

  readonly users = signal<AdminUser[]>([]);
  readonly roles = signal<RoleInfo[]>([]);
  readonly loading = signal(true);
  readonly showForm = signal(false);
  readonly saving = signal(false);
  readonly search = signal('');

  form = signal({ email: '', full_name: '', password: '', role_codes: [] as string[] });
  editing = signal<AdminUser | null>(null);

  ngOnInit(): void {
    this.load();
    this.platform.roles().subscribe({ next: (r) => this.roles.set(r), error: () => {} });
  }

  load(): void {
    this.loading.set(true);
    this.platform.users(this.search().trim() || undefined).subscribe({
      next: (u) => { this.users.set(u); this.loading.set(false); },
      error: (err) => { this.toast.error(err); this.loading.set(false); },
    });
  }

  onSearch(v: string): void { this.search.set(v); this.load(); }

  openNew(): void {
    this.editing.set(null);
    this.form.set({ email: '', full_name: '', password: '', role_codes: ['consulta'] });
    this.showForm.set(true);
  }

  edit(u: AdminUser): void {
    this.editing.set(u);
    this.form.set({ email: u.email, full_name: u.full_name, password: '', role_codes: [...u.roles] });
    this.showForm.set(true);
  }

  toggleRole(code: string): void {
    this.form.update((f) => ({
      ...f,
      role_codes: f.role_codes.includes(code) ? f.role_codes.filter((r) => r !== code) : [...f.role_codes, code],
    }));
  }

  setField(k: 'email' | 'full_name' | 'password', v: string): void { this.form.update((f) => ({ ...f, [k]: v })); }

  save(): void {
    const f = this.form();
    const e = this.editing();
    if (e) {
      const p: Record<string, unknown> = { role_codes: f.role_codes };
      if (f.full_name.trim()) p['full_name'] = f.full_name.trim();
      if (f.password.trim()) p['password'] = f.password;
      this.saving.set(true);
      this.platform.updateUser(e.id, p as never).subscribe({
        next: () => { this.saving.set(false); this.showForm.set(false); this.toast.ok('Usuario actualizado'); this.load(); },
        error: (err) => { this.saving.set(false); this.toast.error(err); },
      });
    } else {
      if (!f.email.trim() || !f.full_name.trim() || f.password.length < 10) {
        this.toast.warn('Correo, nombre y contraseña (mín. 10 caracteres) son requeridos');
        return;
      }
      this.saving.set(true);
      this.platform.createUser({ email: f.email.trim(), full_name: f.full_name.trim(), password: f.password, role_codes: f.role_codes }).subscribe({
        next: () => {
          this.saving.set(false); this.showForm.set(false);
          this.toast.ok('Usuario creado (deberá cambiar su contraseña al ingresar)');
          this.load();
        },
        error: (err) => { this.saving.set(false); this.toast.error(err); },
      });
    }
  }

  async toggleActive(u: AdminUser): Promise<void> {
    const cm = this.confirm();
    const ok = cm ? await cm.ask({
      title: u.active ? 'Desactivar usuario' : 'Reactivar usuario',
      message: `${u.email} — ${u.active ? 'quedará sin acceso (sesiones pendientes siguen hasta expirar).' : 'recuperará el acceso con sus roles actuales.'}`,
      danger: u.active,
      confirmLabel: u.active ? 'Desactivar' : 'Reactivar',
    }) : true;
    if (!ok) return;
    this.platform.updateUser(u.id, { active: !u.active }).subscribe({
      next: () => { this.toast.ok('Estado actualizado'); this.load(); },
      error: (err) => this.toast.error(err),
    });
  }

}
