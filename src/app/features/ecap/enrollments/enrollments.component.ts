import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademicService } from '../../../core/academic/academic.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-enrollments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="head"><h1>Asignaciones</h1></div>

  <div class="tabs">
    <button [class.active]="tab()==='course'" (click)="tab.set('course')">Estudiantes a cursos</button>
    <button [class.active]="tab()==='classroom'" (click)="tab.set('classroom')">Estudiantes a aulas</button>
    <button [class.active]="tab()==='teacher'" (click)="tab.set('teacher')">Maestros</button>
  </div>

  @if (tab()==='course') {
    <div class="panel glass-panel">
      <div class="row">
        <select [(ngModel)]="courseEnroll.course_id"><option value="">Curso</option>@for(c of courses();track c.id){<option [value]="c.id">{{c.name}}</option>}</select>
        <select [(ngModel)]="courseEnroll.student_id"><option value="">Estudiante</option>@for(s of students();track s.id){<option [value]="s.id">{{s.full_name}}</option>}</select>
        <button (click)="enrollCourse()">Asignar</button>
      </div>
      <table>
        <thead><tr><th>Estudiante</th><th>Curso</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          @for (e of courseEnrollments(); track e.id) {
            <tr>
              <td>{{ studentName(e.student_id) }}</td>
              <td>{{ courseName(e.course_id) }}</td>
              <td>{{ e.status }}</td>
              <td><button class="danger" (click)="unenrollCourse(e.id)">Retirar</button></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  @if (tab()==='classroom') {
    <div class="panel glass-panel">
      <div class="row">
        <select [(ngModel)]="classEnroll.classroom_id"><option value="">Aula</option>@for(c of classrooms();track c.id){<option [value]="c.id">{{c.name}}</option>}</select>
        <select [(ngModel)]="classEnroll.student_id"><option value="">Estudiante</option>@for(s of students();track s.id){<option [value]="s.id">{{s.full_name}}</option>}</select>
        <button (click)="enrollClassroom()">Asignar</button>
      </div>
      <table>
        <thead><tr><th>Estudiante</th><th>Aula</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          @for (e of classroomEnrollments(); track e.id) {
            <tr>
              <td>{{ studentName(e.student_id) }}</td>
              <td>{{ classroomName(e.classroom_id) }}</td>
              <td>{{ e.status }}</td>
              <td><button class="danger" (click)="unenrollClassroom(e.id)">Retirar</button></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }

  @if (tab()==='teacher') {
    <div class="panel glass-panel">
      <div class="row">
        <select [(ngModel)]="teacherAssign.teacher_id"><option value="">Maestro</option>@for(t of teachers();track t.id){<option [value]="t.id">{{t.full_name}}</option>}</select>
        <select [(ngModel)]="teacherAssign.course_id"><option value="">Curso (opcional)</option>@for(c of courses();track c.id){<option [value]="c.id">{{c.name}}</option>}</select>
        <select [(ngModel)]="teacherAssign.classroom_id"><option value="">Aula (opcional)</option>@for(c of classrooms();track c.id){<option [value]="c.id">{{c.name}}</option>}</select>
        <button (click)="assignTeacher()">Asignar</button>
      </div>
      <table>
        <thead><tr><th>Maestro</th><th>Curso</th><th>Aula</th><th>Rol</th><th></th></tr></thead>
        <tbody>
          @for (a of teacherAssignments(); track a.id) {
            <tr>
              <td>{{ teacherName(a.teacher_id) }}</td>
              <td>{{ a.course_id ? courseName(a.course_id) : '—' }}</td>
              <td>{{ a.classroom_id ? classroomName(a.classroom_id) : '—' }}</td>
              <td>{{ a.role }}</td>
              <td><button class="danger" (click)="removeAssignment(a.id)">Retirar</button></td>
            </tr>
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
    .row { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
    .row select { padding:8px 10px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--text-primary); }
    .row button { padding:8px 14px; border-radius:8px; border:1px solid var(--primary-500); background:var(--primary-500); color:#fff; cursor:pointer; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th, td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--line); }
    .danger { color:var(--error-300); background:none; border:1px solid var(--line); padding:4px 8px; border-radius:6px; cursor:pointer; }
    .glass-panel { background:var(--glass-card); border:1px solid var(--glass-border); }
  `],
})
export class EnrollmentsComponent implements OnInit {
  private readonly api = inject(AcademicService);
  private readonly toast = inject(ToastService);

  readonly tab = signal('course');
  readonly courses = signal<any[]>([]);
  readonly classrooms = signal<any[]>([]);
  readonly students = signal<any[]>([]);
  readonly teachers = signal<any[]>([]);
  readonly courseEnrollments = signal<any[]>([]);
  readonly classroomEnrollments = signal<any[]>([]);
  readonly teacherAssignments = signal<any[]>([]);

  courseEnroll: any = { course_id: '', student_id: '' };
  classEnroll: any = { classroom_id: '', student_id: '' };
  teacherAssign: any = { teacher_id: '', course_id: '', classroom_id: '' };

  ngOnInit(): void {
    this.api.courses().subscribe({ next: (d) => this.courses.set(d) });
    this.api.classrooms().subscribe({ next: (d) => this.classrooms.set(d) });
    this.api.students().subscribe({ next: (d) => this.students.set(d) });
    this.api.teachers().subscribe({ next: (d) => this.teachers.set(d) });
    this.loadAll();
  }

  loadAll(): void {
    this.api.courseEnrollments().subscribe({ next: (d) => this.courseEnrollments.set(d) });
    this.api.classroomEnrollments().subscribe({ next: (d) => this.classroomEnrollments.set(d) });
    this.api.teacherAssignments().subscribe({ next: (d) => this.teacherAssignments.set(d) });
  }

  courseName(id: string): string { return this.courses().find((c) => c.id === id)?.name ?? id; }
  classroomName(id: string): string { return this.classrooms().find((c) => c.id === id)?.name ?? id; }
  studentName(id: string): string { return this.students().find((s) => s.id === id)?.full_name ?? id; }
  teacherName(id: string): string { return this.teachers().find((t) => t.id === id)?.full_name ?? id; }

  enrollCourse(): void {
    if (!this.courseEnroll.course_id || !this.courseEnroll.student_id) return;
    this.api.enrollCourse(this.courseEnroll.student_id, this.courseEnroll.course_id).subscribe({
      next: () => { this.toast.ok('Asignado'); this.loadAll(); },
      error: (e) => this.toast.error(e),
    });
  }
  unenrollCourse(id: string): void {
    this.api.unenrollCourse(id).subscribe({ next: () => { this.toast.ok('Retirado'); this.loadAll(); }, error: (e) => this.toast.error(e) });
  }
  enrollClassroom(): void {
    if (!this.classEnroll.classroom_id || !this.classEnroll.student_id) return;
    this.api.enrollClassroom(this.classEnroll.student_id, this.classEnroll.classroom_id).subscribe({
      next: () => { this.toast.ok('Asignado'); this.loadAll(); },
      error: (e) => this.toast.error(e),
    });
  }
  unenrollClassroom(id: string): void {
    this.api.unenrollClassroom(id).subscribe({ next: () => { this.toast.ok('Retirado'); this.loadAll(); }, error: (e) => this.toast.error(e) });
  }
  assignTeacher(): void {
    if (!this.teacherAssign.teacher_id) return;
    const payload: any = { teacher_id: this.teacherAssign.teacher_id, role: 'primary' };
    if (this.teacherAssign.course_id) payload.course_id = this.teacherAssign.course_id;
    if (this.teacherAssign.classroom_id) payload.classroom_id = this.teacherAssign.classroom_id;
    this.api.assignTeacher(payload).subscribe({ next: () => { this.toast.ok('Asignado'); this.loadAll(); }, error: (e) => this.toast.error(e) });
  }
  removeAssignment(id: string): void {
    this.api.removeTeacherAssignment(id).subscribe({ next: () => { this.toast.ok('Retirado'); this.loadAll(); }, error: (e) => this.toast.error(e) });
  }
}
