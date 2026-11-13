import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { V1LoginResponse, V1Tokens, V1UserOut } from './session.models';

const ACCESS_KEY = 'ecap_access';
const REFRESH_KEY = 'ecap_refresh';
const USER_KEY = 'ecap_user';

export function patternMatches(pattern: string, permission: string): boolean {
  if (pattern === permission) return true;
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return permission.startsWith(pattern.slice(0, -1));
  return false;
}

export function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.some((g) => patternMatches(g, required));
}

const ROLE_PATTERNS: Record<string, string[]> = {
  admin: ['*'],
  editor: [
    'users.read', 'users.manage', 'landing.*', 'landing.manage', 'courses.*', 'courses.manage', 'classrooms.*', 'classrooms.manage',
    'content.*', 'content.manage', 'materials.*', 'materials.manage', 'assignments.read',
    'assignments.manage', 'grades.read', 'grades.manage', 'announcements.*', 'reports.read',
  ],
  teacher: [
    'courses.read', 'classrooms.read', 'classrooms.manage', 'content.*', 'content.manage',
    'materials.*', 'materials.manage', 'students.read', 'grades.*', 'grades.manage',
    'assignments.manage', 'announcements.*', 'progress.read', 'reports.read',
  ],
  student: [
    'courses.read', 'classrooms.read', 'content.read', 'materials.read', 'grades.read',
    'announcements.read', 'progress.read',
  ],
};

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly base = '/api/v1';

  readonly user = signal<V1UserOut | null>(this.loadUser());
  readonly tokens = signal<V1Tokens | null>(this.loadTokens());

  readonly isAuthenticated = computed(() => !!this.tokens()?.access_token);

  constructor(private readonly http: HttpClient) {}

  permissions(): string[] {
    const u = this.user();
    if (!u) return [];
    if (u.role_code === 'admin') return ['*'];
    return ROLE_PATTERNS[u.role_code] ?? [];
  }

  can(permission: string): boolean {
    const u = this.user();
    if (!u) return false;
    if (u.role_code === 'admin') return true;
    return hasPermission(this.permissions(), permission);
  }

  login(email: string, password: string): Observable<V1LoginResponse> {
    return this.http.post<V1LoginResponse>(`${this.base}/auth/login`, { email, password }).pipe(tap((res) => this.persist(res)));
  }

  refresh(refreshToken: string): Observable<V1Tokens> {
    return this.http.post<V1Tokens>(`${this.base}/auth/refresh`, { refresh_token: refreshToken }).pipe(tap((tokens) => { this.tokens.set(tokens); try { localStorage.setItem(ACCESS_KEY, tokens.access_token); localStorage.setItem(REFRESH_KEY, tokens.refresh_token); } catch {} }));
  }

  logout(): void {
    const rt = this.tokens()?.refresh_token;
    if (rt) {
      this.http.post(`${this.base}/auth/logout`, { refresh_token: rt }).subscribe({ error: () => {} });
    }
    this.clear();
  }

  changePassword(current: string, next: string): Observable<V1Tokens> {
    return this.http.post<V1Tokens>(`${this.base}/auth/change-password`, { current_password: current, new_password: next });
  }

  private persist(res: V1LoginResponse): void {
    if (res.tokens) this.storeTokens(res.tokens);
    this.user.set(res.user);
    try { localStorage.setItem(USER_KEY, JSON.stringify(res.user)); } catch {}
  }

  private storeTokens(tokens: V1Tokens): void {
    this.tokens.set(tokens);
    try {
      localStorage.setItem(ACCESS_KEY, tokens.access_token);
      localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    } catch {}
  }

  private clear(): void {
    this.tokens.set(null);
    this.user.set(null);
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  }

  private loadTokens(): V1Tokens | null {
    try {
      const access = localStorage.getItem(ACCESS_KEY);
      const refresh = localStorage.getItem(REFRESH_KEY);
      return access && refresh ? { access_token: access, refresh_token: refresh, expires_in: 0 } : null;
    } catch { return null; }
  }

  private loadUser(): V1UserOut | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as V1UserOut) : null;
    } catch { return null; }
  }
}
