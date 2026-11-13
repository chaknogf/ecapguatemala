import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AcademicService } from '../../../core/academic/academic.service';
import { SessionService } from '../../../core/v1/session.service';
import { NavIconComponent } from '../../../shared/nav-icon.component';

@Component({
  selector: 'app-portal-home',
  standalone: true,
  imports: [CommonModule, RouterLink, NavIconComponent],
  template: `
  <section class="hero">
    <div class="hero-glow" aria-hidden="true"></div>
    <div class="hero-copy">
      <p class="eyebrow">Aula virtual</p>
      <h1>Hola, {{ firstName() }}</h1>
      <p class="lead">
        @if (courses().length) {
          Tienes {{ courses().length }} {{ courses().length === 1 ? 'curso asignado' : 'cursos asignados' }}.
          Continúa donde lo dejaste y revisa los avisos de tus aulas.
        } @else {
          Bienvenido a tu espacio de formación. Aquí verás tus cursos y avisos cuando estén disponibles.
        }
      </p>
      <div class="hero-actions">
        <a class="btn primary" routerLink="/portal/courses">Ver mis cursos</a>
        <a class="btn ghost" routerLink="/portal/progress">Mi progreso</a>
      </div>
    </div>
    <div class="hero-metrics">
      <div class="metric">
        <span class="label">Cursos</span>
        <strong class="value">{{ courses().length }}</strong>
      </div>
      <div class="metric">
        <span class="label">Avisos</span>
        <strong class="value">{{ announcements().length }}</strong>
      </div>
    </div>
  </section>

  <section class="block" aria-labelledby="continue-title">
    <div class="block-head">
      <div>
        <h2 id="continue-title">Continúa aprendiendo</h2>
        <p>Tus cursos y aulas asignadas.</p>
      </div>
      <a class="link" routerLink="/portal/courses">Ver todos <span aria-hidden="true">→</span></a>
    </div>

    @if (loading()) {
      <div class="course-grid">
        @for (i of [1, 2, 3]; track i) {
          <div class="course-card skeleton" aria-hidden="true"></div>
        }
      </div>
    } @else {
      <div class="course-grid">
        @for (c of courses().slice(0, 6); track c.id; let i = $index) {
          <a class="course-card" [routerLink]="['/portal/courses', c.id]">
            <div class="course-cover" [attr.data-tone]="i % 4">
              <span class="cover-index">0{{ i + 1 }}</span>
              <span class="cover-mark">{{ initial(c.name) }}</span>
            </div>
            <div class="course-body">
              <span class="status">{{ c.status === 'active' || c.status === 'published' ? 'En curso' : c.status }}</span>
              <h3>{{ c.name }}</h3>
              <p>{{ c.description }}</p>
              <div class="course-meta">
                <span>{{ c.level }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ c.duration_hours }} h</span>
                <app-nav-icon name="arrow-right" class="go" />
              </div>
            </div>
          </a>
        } @empty {
          <div class="empty-state">
            <app-nav-icon name="book" />
            <p>Aún no tienes cursos asignados.</p>
            <span>Cuando un docente te inscriba, aparecerán aquí.</span>
          </div>
        }
      </div>
    }
  </section>

  <section class="block" aria-labelledby="news-title">
    <div class="block-head">
      <div>
        <h2 id="news-title">Avisos recientes</h2>
        <p>Comunicaciones de tus aulas y del equipo académico.</p>
      </div>
      <a class="link" routerLink="/portal/announcements">Ver todos <span aria-hidden="true">→</span></a>
    </div>

    <div class="notice-list">
      @for (a of announcements(); track a.id) {
        <article class="notice">
          <div class="notice-top">
            <span class="notice-icon" aria-hidden="true"><app-nav-icon name="megaphone" /></span>
            <div class="notice-heading">
              <h3>{{ a.title }}</h3>
              <span class="notice-date">{{ a.published_at || 'Reciente' }}</span>
            </div>
            @if (a.pinned) { <span class="pin">Fijado</span> }
          </div>
          <p>{{ a.content }}</p>
        </article>
      } @empty {
        <div class="empty-state">
          <app-nav-icon name="bell" />
          <p>Sin avisos por ahora.</p>
          <span>Los comunicados nuevos aparecerán en esta sección.</span>
        </div>
      }
    </div>
  </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        font-size: 0.66rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .eyebrow::before {
        content: '';
        width: 22px;
        height: 1px;
        background: var(--accent-line);
      }

      .hero {
        position: relative;
        overflow: hidden;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: end;
        gap: 2rem;
        padding: clamp(1.6rem, 4vw, 2.8rem);
        margin-bottom: 2.5rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background:
          radial-gradient(520px 260px at 100% 0%, var(--accent-soft), transparent 68%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0) 46%),
          var(--surface);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), var(--shadow-1);
      }

      .hero-glow {
        position: absolute;
        inset: auto -10% -60% auto;
        width: 420px;
        height: 420px;
        background: radial-gradient(circle at center, var(--glow-sky), transparent 66%);
        pointer-events: none;
      }

      .hero-copy {
        position: relative;
        max-width: 56ch;
      }

      .hero h1 {
        margin-top: 0.9rem;
        font-size: clamp(2rem, 4vw, 3.1rem);
        font-weight: 500;
        letter-spacing: -0.042em;
        line-height: 1.05;
        color: var(--text-heading);
      }

      .lead {
        margin-top: 1rem;
        max-width: 48ch;
        color: var(--text-secondary);
        font-size: 0.95rem;
        line-height: 1.7;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        margin-top: 1.6rem;
      }

      .hero-metrics {
        position: relative;
        display: flex;
        gap: 0.75rem;
      }

      .metric {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 108px;
        padding: 1rem 1.1rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        background: color-mix(in srgb, var(--bg-primary) 55%, transparent);
        backdrop-filter: blur(10px);
      }

      .metric .label {
        font-size: 0.6rem;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--text-faint);
      }

      .metric .value {
        font-family: var(--font-display);
        font-size: 1.7rem;
        font-weight: 600;
        letter-spacing: -0.04em;
        line-height: 1;
        color: var(--text-heading);
        font-variant-numeric: tabular-nums;
      }

      .block {
        margin-bottom: 2.75rem;
      }

      .block-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        padding-bottom: 1rem;
        margin-bottom: 1.25rem;
        border-bottom: 1px solid var(--line);
      }

      .block-head h2 {
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: -0.03em;
      }

      .block-head p {
        margin-top: 0.25rem;
        font-size: 0.8rem;
        color: var(--text-muted);
      }

      .link {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--accent);
        text-decoration: none;
      }

      .link:hover {
        color: var(--accent-strong);
      }

      .course-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .course-card {
        display: flex;
        flex-direction: column;
        min-width: 0;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: var(--surface);
        overflow: hidden;
        text-decoration: none;
        color: inherit;
        transition:
          border-color var(--dur) var(--ease),
          transform var(--dur-fast) var(--ease);
      }

      .course-card:hover {
        border-color: var(--line-strong);
        transform: translateY(-2px);
      }

      .course-cover {
        position: relative;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        min-height: 96px;
        padding: 0.9rem 1rem;
        border-bottom: 1px solid var(--line-soft);
        background:
          radial-gradient(220px 120px at 100% 0%, var(--accent-soft), transparent 70%),
          var(--surface-2);
        overflow: hidden;
      }

      .course-cover[data-tone='1'] {
        background:
          radial-gradient(220px 120px at 0% 100%, var(--success-soft), transparent 70%),
          var(--surface-2);
      }
      .course-cover[data-tone='2'] {
        background:
          radial-gradient(220px 120px at 100% 100%, var(--primary-soft), transparent 70%),
          var(--surface-2);
      }
      .course-cover[data-tone='3'] {
        background:
          radial-gradient(220px 120px at 0% 0%, var(--accent-soft), transparent 70%),
          var(--surface-2);
      }

      .cover-index {
        font-size: 0.62rem;
        letter-spacing: 0.16em;
        color: var(--text-faint);
        font-variant-numeric: tabular-nums;
      }

      .cover-mark {
        font-family: var(--font-serif);
        font-size: 2.4rem;
        line-height: 1;
        color: var(--accent);
        opacity: 0.55;
      }

      .course-body {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 1rem 1.1rem 1.15rem;
      }

      .status {
        align-self: flex-start;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--accent-line);
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.6rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .course-body h3 {
        font-size: 0.95rem;
        font-weight: 600;
        line-height: 1.35;
        letter-spacing: -0.02em;
        color: var(--text-heading);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .course-body p {
        font-size: 0.78rem;
        line-height: 1.55;
        color: var(--text-muted);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .course-meta {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-top: 0.35rem;
        font-size: 0.7rem;
        color: var(--text-faint);
      }

      .course-meta .go {
        margin-left: auto;
        color: var(--text-faint);
        transition: color var(--dur) var(--ease), transform var(--dur) var(--ease);
      }

      .course-card:hover .go {
        color: var(--accent);
        transform: translateX(2px);
      }

      .notice-list {
        display: flex;
        flex-direction: column;
        border-top: 1px solid var(--line);
      }

      .notice {
        padding: 1.15rem 0;
        border-bottom: 1px solid var(--line-soft);
      }

      .notice-top {
        display: flex;
        align-items: flex-start;
        gap: 0.7rem;
      }

      .notice-icon {
        display: inline-grid;
        place-items: center;
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        border-radius: 9px;
        border: 1px solid var(--line);
        background: var(--surface-2);
        color: var(--accent);
      }

      .notice-heading {
        min-width: 0;
        flex: 1;
      }

      .notice-heading h3 {
        font-size: 0.9rem;
        font-weight: 600;
        letter-spacing: -0.015em;
        color: var(--text-heading);
      }

      .notice-date {
        display: block;
        margin-top: 0.15rem;
        font-size: 0.65rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--text-faint);
      }

      .pin {
        flex: 0 0 auto;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--accent-line);
        color: var(--accent);
        font-size: 0.58rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .notice > p {
        margin: 0.55rem 0 0 2.7rem;
        font-size: 0.82rem;
        line-height: 1.65;
        color: var(--text-muted);
      }

      .empty-state {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        padding: 2.5rem 1.5rem;
        border: 1px dashed var(--line);
        border-radius: var(--radius-md);
        text-align: center;
        color: var(--text-muted);
      }

      .empty-state app-nav-icon {
        color: var(--text-faint);
        width: 1.5rem;
        height: 1.5rem;
      }

      .empty-state p {
        font-size: 0.88rem;
        color: var(--text-secondary);
      }

      .empty-state span {
        font-size: 0.76rem;
        color: var(--text-faint);
      }

      .skeleton {
        min-height: 230px;
        position: relative;
        overflow: hidden;
        background: var(--fill);
        border-color: transparent;
      }

      .skeleton::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, var(--fill-strong), transparent);
        animation: shimmer 1.6s infinite;
      }

      @keyframes shimmer {
        from {
          transform: translateX(-100%);
        }
        to {
          transform: translateX(100%);
        }
      }

      @media (max-width: 900px) {
        .hero {
          grid-template-columns: 1fr;
          align-items: start;
        }
        .hero-metrics {
          width: 100%;
        }
        .metric {
          flex: 1;
        }
        .course-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 560px) {
        .hero {
          padding: 1.4rem 1.2rem;
          border-radius: var(--radius-lg);
        }
        .hero h1 {
          font-size: 1.85rem;
        }
        .hero-actions .btn {
          flex: 1;
        }
        .course-grid {
          grid-template-columns: 1fr;
        }
        .notice > p {
          margin-left: 0;
        }
      }
    `,
  ],
})
export class PortalHomeComponent implements OnInit {
  private readonly api = inject(AcademicService);
  readonly session = inject(SessionService);
  readonly courses = signal<any[]>([]);
  readonly announcements = signal<any[]>([]);
  readonly loading = signal(true);

  readonly firstName = computed(() => {
    const name = this.session.user()?.full_name?.trim() ?? '';
    return name.split(/\s+/)[0] || 'estudiante';
  });

  ngOnInit(): void {
    this.api.courses().subscribe({
      next: (d) => {
        this.courses.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.announcements().subscribe({ next: (d) => this.announcements.set(d.slice(0, 4)) });
  }

  initial(name: string): string {
    return (name?.trim()?.[0] ?? 'E').toUpperCase();
  }
}
