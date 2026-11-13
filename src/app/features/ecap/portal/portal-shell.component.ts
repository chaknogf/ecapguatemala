import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../../../core/v1/session.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { NavIconComponent } from '../../../shared/nav-icon.component';

@Component({
  selector: 'app-portal-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, NavIconComponent],
  template: `
  <div class="portal">
    <header class="topbar">
      <a class="brand" routerLink="/portal/home" aria-label="Aula virtual ECAP">
        <span class="brand-mark">EC</span>
        <span class="brand-text"><strong>ECAP</strong><small>Aula virtual</small></span>
      </a>

      <nav class="nav" aria-label="Portal del estudiante">
        <a routerLink="/portal/home" routerLinkActive="active">
          <app-nav-icon name="home" /><span>Inicio</span>
        </a>
        <a routerLink="/portal/courses" routerLinkActive="active">
          <app-nav-icon name="book" /><span>Mis cursos</span>
        </a>
        <a routerLink="/portal/grades" routerLinkActive="active">
          <app-nav-icon name="clipboard" /><span>Notas</span>
        </a>
        <a routerLink="/portal/progress" routerLinkActive="active">
          <app-nav-icon name="trend" /><span>Progreso</span>
        </a>
        <a routerLink="/portal/announcements" routerLinkActive="active">
          <app-nav-icon name="bell" /><span>Avisos</span>
        </a>
      </nav>

      <div class="tools">
        <button
          type="button"
          class="theme-toggle"
          (click)="theme.toggle()"
          [attr.aria-label]="theme.theme() === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
        >
          {{ theme.theme() === 'dark' ? '☀' : '☾' }}
        </button>
        <div class="user-chip">
          <span class="avatar">{{ initials() }}</span>
          <span class="user-meta">
            <strong>{{ user()?.full_name }}</strong>
            <small>Estudiante</small>
          </span>
        </div>
        <button class="logout" type="button" (click)="logout()" aria-label="Cerrar sesión">
          <app-nav-icon name="logout" />
        </button>
      </div>
    </header>

    <main class="content">
      <router-outlet />
    </main>

    <nav class="bottom-nav" aria-label="Navegación del portal">
      <a routerLink="/portal/home" routerLinkActive="active"><app-nav-icon name="home" /><span>Inicio</span></a>
      <a routerLink="/portal/courses" routerLinkActive="active"><app-nav-icon name="book" /><span>Cursos</span></a>
      <a routerLink="/portal/progress" routerLinkActive="active"><app-nav-icon name="trend" /><span>Progreso</span></a>
      <a routerLink="/portal/grades" routerLinkActive="active"><app-nav-icon name="clipboard" /><span>Notas</span></a>
      <a routerLink="/portal/announcements" routerLinkActive="active"><app-nav-icon name="bell" /><span>Avisos</span></a>
    </nav>
  </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
      }

      .portal {
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 40;
        display: flex;
        align-items: center;
        gap: 1.5rem;
        min-height: 72px;
        padding: 0 clamp(1rem, 3vw, 2.25rem);
        background: color-mix(in srgb, var(--bg-primary) 86%, transparent);
        border-bottom: 1px solid var(--line);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.65rem;
        text-decoration: none;
        flex: 0 0 auto;
      }

      .brand-mark {
        display: inline-grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 10px;
        border: 1px solid var(--accent-line);
        background: var(--accent-soft);
        color: var(--accent);
        font-family: var(--font-display);
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.06em;
      }

      .brand-text {
        display: flex;
        flex-direction: column;
        line-height: 1.1;
      }
      .brand-text strong {
        font-family: var(--font-display);
        font-size: 0.92rem;
        letter-spacing: 0.12em;
        font-weight: 600;
        color: var(--text-heading);
      }
      .brand-text small {
        font-size: 0.58rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--text-faint);
      }

      .nav {
        display: flex;
        align-items: center;
        gap: 0.15rem;
        margin-left: 1rem;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .nav::-webkit-scrollbar {
        display: none;
      }

      .nav a {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.45rem 0.8rem;
        border-radius: 999px;
        text-decoration: none;
        color: var(--text-muted);
        font-size: 0.79rem;
        font-weight: 500;
        white-space: nowrap;
        transition: color var(--dur) var(--ease), background-color var(--dur) var(--ease);
      }

      .nav a:hover {
        color: var(--text-primary);
        background: var(--fill-soft);
      }

      .nav a.active {
        color: var(--accent);
        background: var(--accent-soft);
        font-weight: 600;
      }

      .tools {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }

      .user-chip {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.2rem 0.45rem 0.2rem 0.2rem;
      }

      .avatar {
        display: inline-grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 1px solid var(--accent-line);
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.62rem;
        font-weight: 700;
      }

      .user-meta {
        display: flex;
        flex-direction: column;
        line-height: 1.2;
      }
      .user-meta strong {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-primary);
        max-width: 15ch;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .user-meta small {
        font-size: 0.6rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--text-faint);
      }

      .logout {
        display: inline-grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 1px solid var(--line);
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease),
          background-color var(--dur) var(--ease);
      }
      .logout:hover {
        color: var(--error-300);
        border-color: var(--error-line);
        background: var(--error-soft);
      }

      .content {
        flex: 1;
        width: min(1180px, 100% - clamp(2rem, 6vw, 5rem));
        margin-inline: auto;
        padding: clamp(1.5rem, 4vw, 3rem) 0 clamp(2rem, 5vw, 3.5rem);
      }

      .bottom-nav {
        display: none;
      }

      @media (max-width: 900px) {
        .nav {
          display: none;
        }

        .user-meta {
          display: none;
        }

        .user-chip {
          padding: 0;
        }

        .content {
          padding-bottom: 108px;
        }

        .bottom-nav {
          position: fixed;
          left: 0.7rem;
          right: 0.7rem;
          bottom: calc(0.7rem + env(safe-area-inset-bottom, 0px));
          z-index: 45;
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: 1fr;
          gap: 2px;
          padding: 0.35rem;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: color-mix(in srgb, var(--surface) 88%, transparent);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          box-shadow: var(--shadow-2);
        }

        .bottom-nav a {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.2rem;
          min-height: 52px;
          padding: 0.35rem 0.2rem;
          border-radius: 12px;
          text-decoration: none;
          color: var(--text-muted);
          font-size: 0.56rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          transition: color var(--dur) var(--ease), background-color var(--dur) var(--ease);
        }

        .bottom-nav a.active {
          color: var(--accent);
          background: var(--accent-soft);
        }
      }

      @media (max-width: 480px) {
        .topbar {
          min-height: 62px;
          gap: 0.75rem;
        }
        .brand-text small {
          display: none;
        }
        .content {
          width: calc(100% - 1.8rem);
          padding-top: 1.25rem;
        }
      }
    `,
  ],
})
export class PortalShellComponent {
  readonly session = inject(SessionService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  readonly user = this.session.user;
  readonly initials = computed(() => {
    const name = this.user()?.full_name?.trim() ?? '';
    if (!name) return 'EC';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase() ?? '')
      .join('');
  });

  logout(): void {
    this.session.logout();
    this.router.navigate(['/login']);
  }
}
