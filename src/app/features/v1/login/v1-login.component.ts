import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../../core/v1/session.service';
import { ThemeService } from '../../../core/theme/theme.service';

@Component({
  selector: 'app-v1-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './v1-login.component.html',
  styleUrl: './v1-login.component.scss',
})
export class V1LoginComponent {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);

  email = '';
  password = '';
  readonly year = new Date().getFullYear();
  loading = signal(false);
  error = signal<string | null>(null);
  showPassword = false;

  readonly demoAccounts = [
    { email: 'admin@ecap.demo', label: 'Administrador', role: 'admin' },
    { email: 'editor@ecap.demo', label: 'Editor', role: 'editor' },
    { email: 'maestro@ecap.demo', label: 'Maestro', role: 'teacher' },
    { email: 'estudiante01@ecap.demo', label: 'Estudiante', role: 'student' },
  ];

  submit(): void {
    if (!this.email || !this.password) {
      this.error.set('Ingrese correo y contraseña');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.session.login(this.email, this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        const role = res.user.role_code;
        this.router.navigate([role === 'student' ? '/portal/home' : '/app/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Credenciales inválidas o servidor no disponible');
      },
    });
  }

  quick(email: string): void {
    this.email = email;
    this.password = 'Demo1234!';
    this.submit();
  }
}
