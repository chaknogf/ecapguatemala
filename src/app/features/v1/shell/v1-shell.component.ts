import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SessionService } from '../../../core/v1/session.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ToastsComponent } from '../../../shared/ui';
import { NavIconComponent } from '../../../shared/nav-icon.component';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  perm: string | null;
}

@Component({
  selector: 'app-v1-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ToastsComponent, NavIconComponent],
  templateUrl: './v1-shell.component.html',
  styleUrl: './v1-shell.component.scss',
})
export class V1ShellComponent {
  readonly session = inject(SessionService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  readonly menuOpen = signal(false);
  readonly pageTitle = signal('Panel general');

  private readonly nav: NavItem[] = [
    { path: '/app/dashboard', label: 'Panel', icon: 'grid', perm: 'reports.read' },
    { path: '/app/users', label: 'Usuarios', icon: 'users', perm: 'users.read' },
    { path: '/app/courses', label: 'Cursos', icon: 'book', perm: 'courses.read' },
    { path: '/app/classrooms', label: 'Aulas', icon: 'building', perm: 'classrooms.read' },
    { path: '/app/content', label: 'Contenidos', icon: 'layers', perm: 'content.read' },
    { path: '/app/enrollments', label: 'Asignaciones', icon: 'link', perm: 'assignments.manage' },
    { path: '/app/grades', label: 'Calificaciones', icon: 'clipboard', perm: 'grades.read' },
    { path: '/app/announcements', label: 'Avisos', icon: 'megaphone', perm: 'announcements.read' },
    { path: '/app/activity', label: 'Actividad', icon: 'chart', perm: 'reports.read' },
    { path: '/app/integration', label: 'Integración', icon: 'plug', perm: 'lms.manage' },
    { path: '/app/landing', label: 'Sitio público', icon: 'globe', perm: 'landing.manage' },
  ];

  readonly items = computed(() => this.nav.filter((n) => !n.perm || this.session.can(n.perm)));
  readonly primaryItems = computed(() => this.items().slice(0, 4));
  readonly user = computed(() => this.session.user());
  readonly initials = computed(() => {
    const name = this.user()?.full_name?.trim() ?? '';
    if (!name) return 'EC';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase() ?? '')
      .join('');
  });
  readonly roleLabel = computed(() => {
    const map: Record<string, string> = {
      admin: 'Administrador',
      editor: 'Editor',
      teacher: 'Maestro',
      student: 'Estudiante',
    };
    return map[this.user()?.role_code ?? ''] ?? 'Usuario';
  });

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.pageTitle.set(this.resolveTitle(this.router.url));
      this.menuOpen.set(false);
    });
    this.pageTitle.set(this.resolveTitle(this.router.url));
  }

  logout(): void {
    this.session.logout();
    this.router.navigate(['/login']);
  }

  private resolveTitle(url: string): string {
    const clean = url.split('?')[0];
    const match = [...this.nav].sort((a, b) => b.path.length - a.path.length).find((n) => clean.startsWith(n.path));
    return match?.label ?? 'Panel general';
  }
}
