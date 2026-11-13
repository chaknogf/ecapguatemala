import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AcademicService } from '../../../core/academic/academic.service';
import { SessionService } from '../../../core/v1/session.service';

@Component({
  selector: 'app-portal-grades',
  standalone: true,
  imports: [CommonModule],
  template: `
  <h1>Mis calificaciones</h1>
  @if (loading()) { <p>Cargando…</p> }
  <div class="table-wrap glass-panel">
    <table>
      <thead><tr><th>Curso/Aula</th><th>Evaluación</th><th>Nota</th><th>Máx</th><th>Observaciones</th><th>Fecha</th></tr></thead>
      <tbody>
        @for (g of grades(); track g.id) {
          <tr>
            <td>{{ classroomName(g.classroom_id) }}</td>
            <td>{{ g.assessment_name }}</td>
            <td>{{ g.score }}</td>
            <td>{{ g.max_score }}</td>
            <td>{{ g.observations }}</td>
            <td>{{ g.graded_at }}</td>
          </tr>
        } @empty { <tr><td colspan="6">Sin calificaciones.</td></tr> }
      </tbody>
    </table>
  </div>
  `,
  styles: [`
    h1 { margin-bottom:16px; }
    .table-wrap { overflow:auto; border-radius:12px; }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--line); }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class PortalGradesComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly session = inject(SessionService);
  readonly grades = signal<any[]>([]);
  readonly classrooms = signal<any[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.api.classrooms().subscribe({ next: (d) => this.classrooms.set(d) });
    const sid = this.session.user()?.id;
    if (sid) {
      this.api.grades({ student_id: sid }).subscribe({ next: (d) => { this.grades.set(d); this.loading.set(false); }, error: () => this.loading.set(false) });
    }
  }

  classroomName(id: string): string { return this.classrooms().find((c) => c.id === id)?.name ?? id; }
}
