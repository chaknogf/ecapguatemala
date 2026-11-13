import { Routes } from '@angular/router';
import { v1AuthGuard, v1LoginGuard, v1PermissionGuard } from './core/v1/v1.guards';

export const routes: Routes = [
  { path: 'login', canActivate: [v1LoginGuard], loadComponent: () => import('./features/v1/login/v1-login.component').then((m) => m.V1LoginComponent) },

  // Panel de gestión
  {
    path: 'app',
    canActivate: [v1AuthGuard],
    loadComponent: () => import('./features/v1/shell/v1-shell.component').then((m) => m.V1ShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/v1/dashboard/v1-dashboard.component').then((m) => m.V1DashboardComponent) },
      { path: 'users', canActivate: [v1PermissionGuard('users.read')], loadComponent: () => import('./features/ecap/users/users.component').then((m) => m.UsersComponent) },
      { path: 'courses', loadComponent: () => import('./features/ecap/courses/courses.component').then((m) => m.CoursesComponent) },
      { path: 'courses/:id', loadComponent: () => import('./features/ecap/courses/course-detail.component').then((m) => m.CourseDetailComponent) },
      { path: 'classrooms', loadComponent: () => import('./features/ecap/classrooms/classrooms.component').then((m) => m.ClassroomsComponent) },
      { path: 'content', loadComponent: () => import('./features/ecap/content/content.component').then((m) => m.ContentComponent) },
      { path: 'enrollments', canActivate: [v1PermissionGuard('assignments.manage')], loadComponent: () => import('./features/ecap/enrollments/enrollments.component').then((m) => m.EnrollmentsComponent) },
      { path: 'grades', loadComponent: () => import('./features/ecap/grades/grades.component').then((m) => m.GradesComponent) },
      { path: 'announcements', loadComponent: () => import('./features/ecap/announcements/announcements.component').then((m) => m.AnnouncementsComponent) },
      { path: 'activity', loadComponent: () => import('./features/ecap/activity/activity.component').then((m) => m.ActivityComponent) },
      { path: 'landing', canActivate: [v1PermissionGuard('landing.manage')], loadComponent: () => import('./features/ecap/landing-manage/landing-manage.component').then((m) => m.LandingManageComponent) },
      { path: 'change-password', loadComponent: () => import('./features/v1/account/change-password.component').then((m) => m.ChangePasswordComponent) },
    ],
  },

  // Portal del estudiante
  {
    path: 'portal',
    canActivate: [v1AuthGuard],
    loadComponent: () => import('./features/ecap/portal/portal-shell.component').then((m) => m.PortalShellComponent),
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', loadComponent: () => import('./features/ecap/portal/home.component').then((m) => m.PortalHomeComponent) },
      { path: 'courses', loadComponent: () => import('./features/ecap/portal/courses.component').then((m) => m.PortalCoursesComponent) },
      { path: 'courses/:id', loadComponent: () => import('./features/ecap/portal/course-detail.component').then((m) => m.PortalCourseDetailComponent) },
      { path: 'classroom/:id', loadComponent: () => import('./features/ecap/portal/classroom.component').then((m) => m.PortalClassroomComponent) },
      { path: 'grades', loadComponent: () => import('./features/ecap/portal/grades.component').then((m) => m.PortalGradesComponent) },
      { path: 'progress', loadComponent: () => import('./features/ecap/portal/progress.component').then((m) => m.PortalProgressComponent) },
      { path: 'announcements', loadComponent: () => import('./features/ecap/portal/announcements.component').then((m) => m.PortalAnnouncementsComponent) },
    ],
  },

  { path: '', loadComponent: () => import('./features/ecap/landing/landing.component').then((m) => m.LandingComponent) },
  { path: '**', redirectTo: '' },
];
