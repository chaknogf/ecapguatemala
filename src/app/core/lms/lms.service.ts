import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = '/api/v1/lms';

export interface LmsDraft {
  deployment_type: string;
  base_url: string;
  strategy: string;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  token_set: boolean;
  token_hint: string | null;
}

export interface LmsConnection {
  configured: boolean;
  status: string;
  deployment_type: string;
  base_url: string | null;
  token_set: boolean;
  token_hint: string | null;
  strategy: string;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  site_name: string | null;
  moodle_release: string | null;
  moodle_version: string | null;
  capabilities: Record<string, boolean>;
  capability_warnings: string[];
  last_checked_at: string | null;
  last_error: string | null;
  draft: LmsDraft | null;
  updated_at: string | null;
}

export interface LmsTestResult {
  ok: boolean;
  message: string;
  site_name: string | null;
  username: string | null;
  release: string | null;
  version: string | null;
  capabilities: Record<string, boolean>;
  warnings: string[];
  checked_at: string;
}

export interface LmsActivateResult {
  ok: boolean;
  message: string;
  connection: LmsConnection;
}

export interface LmsSettingsPayload {
  deployment_type: string;
  base_url: string;
  strategy: string;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  token?: string;
}

@Injectable({ providedIn: 'root' })
export class LmsService {
  private readonly http = inject(HttpClient);

  settings(): Observable<LmsConnection> {
    return this.http.get<LmsConnection>(`${BASE}/settings`);
  }

  save(payload: LmsSettingsPayload): Observable<LmsConnection> {
    return this.http.put<LmsConnection>(`${BASE}/settings`, payload);
  }

  test(payload?: { base_url?: string; token?: string }): Observable<LmsTestResult> {
    return this.http.post<LmsTestResult>(`${BASE}/test`, payload ?? {});
  }

  activate(): Observable<LmsActivateResult> {
    return this.http.post<LmsActivateResult>(`${BASE}/activate`, {});
  }

  disconnect(): Observable<LmsConnection> {
    return this.http.post<LmsConnection>(`${BASE}/disconnect`, {});
  }
}
