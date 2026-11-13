import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = '/api/v1';

@Injectable({ providedIn: 'root' })
export class AcademicService {
  private readonly http = inject(HttpClient);

  // categories
  categories(): Observable<any[]> { return this.http.get<any[]>(`${BASE}/categories`); }
  createCategory(p: any): Observable<any> { return this.http.post<any>(`${BASE}/categories`, p); }

  // courses
  courses(params?: { status?: string; search?: string }): Observable<any[]> {
    const q: any = {};
    if (params?.status) q.status = params.status;
    if (params?.search) q.search = params.search;
    return this.http.get<any[]>(`${BASE}/courses`, { params: q });
  }
  course(id: string): Observable<any> { return this.http.get<any>(`${BASE}/courses/${id}`); }
  createCourse(p: any): Observable<any> { return this.http.post<any>(`${BASE}/courses`, p); }
  updateCourse(id: string, p: any): Observable<any> { return this.http.patch<any>(`${BASE}/courses/${id}`, p); }
  deleteCourse(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/courses/${id}`); }

  // classrooms
  classrooms(params?: { course_id?: string }): Observable<any[]> {
    const q: any = {};
    if (params?.course_id) q.course_id = params.course_id;
    return this.http.get<any[]>(`${BASE}/classrooms`, { params: q });
  }
  classroom(id: string): Observable<any> { return this.http.get<any>(`${BASE}/classrooms/${id}`); }
  createClassroom(p: any): Observable<any> { return this.http.post<any>(`${BASE}/classrooms`, p); }
  updateClassroom(id: string, p: any): Observable<any> { return this.http.patch<any>(`${BASE}/classrooms/${id}`, p); }
  deleteClassroom(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/classrooms/${id}`); }

  // units
  units(classroomId: string): Observable<any[]> { return this.http.get<any[]>(`${BASE}/classrooms/${classroomId}/units`); }
  createUnit(p: any): Observable<any> { return this.http.post<any>(`${BASE}/units`, p); }
  updateUnit(id: string, p: any): Observable<any> { return this.http.patch<any>(`${BASE}/units/${id}`, p); }
  deleteUnit(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/units/${id}`); }

  // lessons
  lessons(unitId: string): Observable<any[]> { return this.http.get<any[]>(`${BASE}/units/${unitId}/lessons`); }
  createLesson(p: any): Observable<any> { return this.http.post<any>(`${BASE}/lessons`, p); }
  updateLesson(id: string, p: any): Observable<any> { return this.http.patch<any>(`${BASE}/lessons/${id}`, p); }
  deleteLesson(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/lessons/${id}`); }

  // resources
  resources(params?: { lesson_id?: string; classroom_id?: string; course_id?: string }): Observable<any[]> {
    const q: any = {};
    if (params?.lesson_id) q.lesson_id = params.lesson_id;
    if (params?.classroom_id) q.classroom_id = params.classroom_id;
    if (params?.course_id) q.course_id = params.course_id;
    return this.http.get<any[]>(`${BASE}/resources`, { params: q });
  }
  createResource(p: any): Observable<any> { return this.http.post<any>(`${BASE}/resources`, p); }
  updateResource(id: string, p: any): Observable<any> { return this.http.patch<any>(`${BASE}/resources/${id}`, p); }
  deleteResource(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/resources/${id}`); }

  // enrollments
  enrollCourse(student_id: string, course_id: string): Observable<any> {
    return this.http.post<any>(`${BASE}/enrollments/course`, { student_id, course_id });
  }
  unenrollCourse(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/enrollments/course/${id}`); }
  courseEnrollments(params?: { course_id?: string; student_id?: string }): Observable<any[]> {
    const q: any = {};
    if (params?.course_id) q.course_id = params.course_id;
    if (params?.student_id) q.student_id = params.student_id;
    return this.http.get<any[]>(`${BASE}/enrollments/courses`, { params: q });
  }
  enrollClassroom(student_id: string, classroom_id: string): Observable<any> {
    return this.http.post<any>(`${BASE}/enrollments/classroom`, { student_id, classroom_id });
  }
  unenrollClassroom(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/enrollments/classroom/${id}`); }
  classroomEnrollments(params?: { classroom_id?: string; student_id?: string }): Observable<any[]> {
    const q: any = {};
    if (params?.classroom_id) q.classroom_id = params.classroom_id;
    if (params?.student_id) q.student_id = params.student_id;
    return this.http.get<any[]>(`${BASE}/enrollments/classrooms`, { params: q });
  }

  // teacher assignments
  teacherAssignments(params?: { teacher_id?: string; course_id?: string; classroom_id?: string }): Observable<any[]> {
    const q: any = {};
    if (params?.teacher_id) q.teacher_id = params.teacher_id;
    if (params?.course_id) q.course_id = params.course_id;
    if (params?.classroom_id) q.classroom_id = params.classroom_id;
    return this.http.get<any[]>(`${BASE}/teacher-assignments`, { params: q });
  }
  assignTeacher(p: any): Observable<any> { return this.http.post<any>(`${BASE}/teacher-assignments`, p); }
  removeTeacherAssignment(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/teacher-assignments/${id}`); }

  // grades
  grades(params?: { student_id?: string; classroom_id?: string }): Observable<any[]> {
    const q: any = {};
    if (params?.student_id) q.student_id = params.student_id;
    if (params?.classroom_id) q.classroom_id = params.classroom_id;
    return this.http.get<any[]>(`${BASE}/grades`, { params: q });
  }
  createGrade(p: any): Observable<any> { return this.http.post<any>(`${BASE}/grades`, p); }
  updateGrade(id: string, p: any): Observable<any> { return this.http.patch<any>(`${BASE}/grades/${id}`, p); }
  deleteGrade(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/grades/${id}`); }

  // announcements
  announcements(params?: { course_id?: string; classroom_id?: string }): Observable<any[]> {
    const q: any = {};
    if (params?.course_id) q.course_id = params.course_id;
    if (params?.classroom_id) q.classroom_id = params.classroom_id;
    return this.http.get<any[]>(`${BASE}/announcements`, { params: q });
  }
  createAnnouncement(p: any): Observable<any> { return this.http.post<any>(`${BASE}/announcements`, p); }
  deleteAnnouncement(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/announcements/${id}`); }

  // progress
  progress(params?: { student_id?: string; lesson_id?: string }): Observable<any[]> {
    const q: any = {};
    if (params?.student_id) q.student_id = params.student_id;
    if (params?.lesson_id) q.lesson_id = params.lesson_id;
    return this.http.get<any[]>(`${BASE}/progress`, { params: q });
  }
  updateProgress(p: any): Observable<any> { return this.http.post<any>(`${BASE}/progress`, p); }

  // stats
  dashboardStats(): Observable<any> { return this.http.get<any>(`${BASE}/stats/dashboard`); }

  // people
  students(search?: string): Observable<any[]> {
    const q: any = {};
    if (search) q.search = search;
    return this.http.get<any[]>(`${BASE}/people/students`, { params: q });
  }
  teachers(search?: string): Observable<any[]> {
    const q: any = {};
    if (search) q.search = search;
    return this.http.get<any[]>(`${BASE}/people/teachers`, { params: q });
  }

  // users
  users(params?: { search?: string; role?: string; active?: boolean }): Observable<any[]> {
    const q: any = {};
    if (params?.search) q.search = params.search;
    if (params?.role) q.role = params.role;
    if (params?.active !== undefined) q.active = params.active;
    return this.http.get<any[]>(`${BASE}/users`, { params: q });
  }
  createUser(p: any): Observable<any> { return this.http.post<any>(`${BASE}/users`, p); }
  updateUser(id: string, p: any): Observable<any> { return this.http.patch<any>(`${BASE}/users/${id}`, p); }
  deleteUser(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/users/${id}`); }
  roles(): Observable<any[]> { return this.http.get<any[]>(`${BASE}/users/roles/list`); }

  // activity
  activity(limit = 20): Observable<any[]> { return this.http.get<any[]>(`${BASE}/activity`, { params: { limit } }); }
  // landing (CMS)
  landingSections(publishedOnly = true): Observable<any[]> { return this.http.get<any[]>(`${BASE}/landing/sections`, { params: { published_only: publishedOnly } }); }
  landingSection(key: string): Observable<any> { return this.http.get<any>(`${BASE}/landing/sections/${key}`); }
  createLandingSection(p: any): Observable<any> { return this.http.post<any>(`${BASE}/landing/sections`, p); }
  updateLandingSection(key: string, p: any): Observable<any> { return this.http.patch<any>(`${BASE}/landing/sections/${key}`, p); }
  deleteLandingSection(key: string): Observable<any> { return this.http.delete<any>(`${BASE}/landing/sections/${key}`); }

  publications(publishedOnly = true): Observable<any[]> { return this.http.get<any[]>(`${BASE}/landing/publications`, { params: { published_only: publishedOnly } }); }
  createPublication(p: any): Observable<any> { return this.http.post<any>(`${BASE}/landing/publications`, p); }
  updatePublication(id: string, p: any): Observable<any> { return this.http.patch<any>(`${BASE}/landing/publications/${id}`, p); }
  deletePublication(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/landing/publications/${id}`); }

  news(publishedOnly = true): Observable<any[]> { return this.http.get<any[]>(`${BASE}/landing/news`, { params: { published_only: publishedOnly } }); }
  createNews(p: any): Observable<any> { return this.http.post<any>(`${BASE}/landing/news`, p); }
  updateNews(id: string, p: any): Observable<any> { return this.http.patch<any>(`${BASE}/landing/news/${id}`, p); }
  deleteNews(id: string): Observable<any> { return this.http.delete<any>(`${BASE}/landing/news/${id}`); }
}
