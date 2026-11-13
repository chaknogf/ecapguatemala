import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AcademicService } from '../../../core/academic/academic.service';
import { SessionService } from '../../../core/v1/session.service';
import { ToastService } from '../../../shared/ui';
import { NavIconComponent } from '../../../shared/nav-icon.component';

@Component({
  selector: 'app-v1-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, NavIconComponent],
  templateUrl: './v1-dashboard.component.html',
  styleUrl: './v1-dashboard.component.scss',
})
export class V1DashboardComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);

  readonly stats = signal<any>(null);
  readonly loading = signal(true);

  readonly firstName = computed(() => {
    const name = this.session.user()?.full_name?.trim() ?? '';
    return name.split(/\s+/)[0] || 'equipo ECAP';
  });

  readonly roleLabel = computed(() => {
    const map: Record<string, string> = {
      admin: 'Administrador',
      editor: 'Editor',
      teacher: 'Maestro',
      student: 'Estudiante',
    };
    return map[this.session.user()?.role_code ?? ''] ?? 'Usuario';
  });

  readonly today = new Intl.DateTimeFormat('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.dashboardStats().subscribe({
      next: (d) => {
        this.stats.set(d);
        this.loading.set(false);
      },
      error: (err) => {
        this.toast.error(err);
        this.loading.set(false);
      },
    });
  }

  when(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-GT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  get role(): string {
    return this.session.user()?.role_code ?? '';
  }
}
