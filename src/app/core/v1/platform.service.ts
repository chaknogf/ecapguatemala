import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = '/api/v1';

export interface DashboardData {
  period_days: number;
  currency: string | null;
  inventory_value: string;
  products_low_stock: number;
  products_out_of_stock: number;
  lots_expiring_within_warn: number;
  lots_expiring_within_critical: number;
  expired_lot_units_on_hand: string;
  purchase_orders_pending_reception: number;
  sales_orders_pending_dispatch: number;
  sales_gross_period: string;
  estimated_gross_profit_period: string;
  taxes_issued_period: string;
  receivables_balance: string;
  movements_period: number;
  accounting: null;
  notes: Record<string, string>;
}

export interface Company {
  id: string; legal_name: string; trade_name: string; tax_id: string | null;
  country_code: string; currency_code: string; timezone: string;
  address: string | null; phone: string | null; email: string | null; active: boolean;
  inventory_policy: Record<string, unknown>; expiry_policy: Record<string, unknown>;
  enabled_modules: string[];
}

export interface Branch { id: string; code: string; name: string; address: string | null; active: boolean }
export interface Warehouse {
  id: string; branch_id: string; code: string; name: string; location: string | null;
  active: boolean; allow_negative: boolean;
}

export interface AdminUser {
  id: string; email: string; full_name: string; active: boolean; is_platform_admin: boolean;
  must_change_password: boolean; last_login_at: string | null; roles: string[];
}

export interface RoleInfo { id: string; code: string; name: string; permission_patterns: string[]; system_role: boolean }

export interface AuditEvent {
  id: string; occurred_at: string; actor_email: string | null; action: string;
  entity_type: string; entity_id: string | null; document_ref: string | null;
  result: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  source_ip: string | null;
}

@Injectable({ providedIn: 'root' })
export class V1PlatformService {
  private readonly http = inject(HttpClient);

  dashboard(days = 30): Observable<DashboardData> {
    return this.http.get<DashboardData>(`${BASE}/dashboard?days=${days}`);
  }

  currentCompany(): Observable<Company> { return this.http.get<Company>(`${BASE}/companies/current`); }
  updateCompany(p: Partial<Company>): Observable<Company> {
    return this.http.patch<Company>(`${BASE}/companies/current`, p);
  }

  branches(): Observable<Branch[]> { return this.http.get<Branch[]>(`${BASE}/branches`); }
  createBranch(p: { code: string; name: string; address?: string | null }): Observable<Branch> {
    return this.http.post<Branch>(`${BASE}/branches`, p);
  }
  warehouses(): Observable<Warehouse[]> { return this.http.get<Warehouse[]>(`${BASE}/warehouses`); }
  createWarehouse(p: { branch_id: string; code: string; name: string; location?: string | null; allow_negative?: boolean }): Observable<Warehouse> {
    return this.http.post<Warehouse>(`${BASE}/warehouses`, p);
  }

  users(q?: string): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${BASE}/users`, { params: q ? { q } : {} });
  }
  createUser(p: { email: string; full_name: string; password: string; role_codes?: string[] }): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${BASE}/users`, p);
  }
  updateUser(id: string, p: { full_name?: string; active?: boolean; role_codes?: string[]; password?: string; must_change_password?: boolean }): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${BASE}/users/${id}`, p);
  }
  roles(): Observable<RoleInfo[]> { return this.http.get<RoleInfo[]>(`${BASE}/roles`); }
  permissionsCatalog(): Observable<string[]> { return this.http.get<string[]>(`${BASE}/permissions/catalog`); }

  audit(params: { entity_type?: string; action?: string; page?: number } = {}): Observable<AuditEvent[]> {
    const q: Record<string, string> = {};
    Object.entries(params).forEach(([k, v]) => { if (v != null) q[k] = String(v); });
    return this.http.get<AuditEvent[]>(`${BASE}/audit/events`, { params: q });
  }
}
