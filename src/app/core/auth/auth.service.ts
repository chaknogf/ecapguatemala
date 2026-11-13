import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: number;
  email: string;
  username: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly api = `${environment.apiUrl}/api`;
  private readonly tokenKey = 'synvapp_token';
  private readonly userKey = 'synvapp_user';

  private readonly userSubject = new BehaviorSubject<AuthUser | null>(this.loadUser());
  readonly user$: Observable<AuthUser | null> = this.userSubject.asObservable();

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getUser(): AuthUser | null {
    return this.userSubject.value;
  }

  login(identifier: string, password: string): Promise<AuthUser> {
    return this.http
      .post<AuthResponse>(`${this.api}/auth/login`, { identifier, password })
      .pipe(tap((res) => this.persistSession(res)))
      .toPromise()
      .then((res) => res!.user);
  }

  register(email: string, password: string): Promise<AuthUser> {
    return this.http
      .post<AuthResponse>(`${this.api}/auth/register`, { email, password })
      .pipe(tap((res) => this.persistSession(res)))
      .toPromise()
      .then((res) => res!.user);
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.userSubject.next(null);
    this.router.navigate(['/login']);
  }

  validatePasswordStrength(password: string): { valid: boolean; strength: number; message: string } {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    const messages = [
      'Muy débil',
      'Muy débil',
      'Débil',
      'Media',
      'Fuerte',
      'Muy fuerte',
      'Excelente',
    ];
    return {
      valid: strength >= 5,
      strength,
      message: messages[Math.min(strength, 6)],
    };
  }

  private persistSession(res: AuthResponse): void {
    localStorage.setItem(this.tokenKey, res.token);
    localStorage.setItem(this.userKey, JSON.stringify(res.user));
    this.userSubject.next(res.user);
  }

  private loadUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(this.userKey);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}
