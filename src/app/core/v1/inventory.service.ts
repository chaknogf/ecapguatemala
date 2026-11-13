import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = '/api/v1';

export type MovementType =
  | 'receipt' | 'sale' | 'return_in' | 'return_out' | 'transfer_in' | 'transfer_out'
  | 'adjustment' | 'production_in' | 'production_out' | 'count' | 'reversal' | 'damage' | 'expired';

export interface StockView {
  product_id: string; product_sku: string; product_name: string;
  variant_id: string | null; variant_sku: string | null;
  warehouse_id: string; lot_id: string | null; lot_number: string | null;
  expiry_date: string | null;
  on_hand: string; reserved: string; available: string; unit_cost: string;
  stock_light: string; expiry_light: string | null;
}

export interface Lot {
  id: string; product_id: string; variant_id: string | null; lot_number: string;
  supplier_name: string | null; manufactured_at: string | null; expiry_date: string | null;
  received_at: string; acquisition_cost: string; status: string; notes: string | null;
}

export interface MovementLine {
  id: string; product_id: string; variant_id: string | null; warehouse_id: string;
  lot_id: string | null; quantity: string; unit_cost: string;
  reverses_line_id: string | null; note: string | null;
}

export interface Movement {
  id: string; movement_type: MovementType; reference_document: string | null;
  idempotency_key: string | null; reason: string | null; occurred_at: string;
  created_by_id: string; from_warehouse_id: string | null; to_warehouse_id: string | null;
  counterparty: string | null; lines: MovementLine[];
}

export interface MovementPayload {
  movement_type: MovementType;
  lines: { product_id: string; variant_id?: string | null; warehouse_id?: string | null;
           lot_id?: string | null; quantity: string; unit_cost?: string | null; note?: string | null }[];
  warehouse_id?: string | null; from_warehouse_id?: string | null; to_warehouse_id?: string | null;
  branch_id?: string | null; reference_document?: string | null; idempotency_key?: string | null;
  reason?: string | null; counterparty?: string | null; auto_pick?: 'fefo' | null;
}

export interface KardexEntry {
  line_id: string; occurred_at: string; movement_type: string; reference_document: string | null;
  warehouse_id: string; lot_id: string | null; quantity: string; in: string; out: string;
  unit_cost: string; balance: string;
}
export interface KardexResult {
  product_id: string; product_sku: string; opening_balance: string;
  movements: KardexEntry[]; final_balance: string; current_on_hand: string; reconciled: boolean;
}

export interface ExpiringLot {
  lot_id: string; lot_number: string; product_id: string; product_sku: string; product_name: string;
  expiry_date: string; days_to_expiry: number; on_hand: string; light: string; status: string;
}

@Injectable({ providedIn: 'root' })
export class V1InventoryService {
  private readonly http = inject(HttpClient);

  stock(params: { warehouse_id?: string; product_id?: string; only_low?: boolean } = {}): Observable<StockView[]> {
    let hp = new HttpParams();
    if (params.warehouse_id) hp = hp.set('warehouse_id', params.warehouse_id);
    if (params.product_id) hp = hp.set('product_id', params.product_id);
    if (params.only_low) hp = hp.set('only_low', 'true');
    return this.http.get<StockView[]>(`${BASE}/stock`, { params: hp });
  }

  movement(payload: MovementPayload): Observable<Movement> {
    return this.http.post<Movement>(`${BASE}/movements`, payload);
  }

  transfer(payload: {
    from_warehouse_id: string; to_warehouse_id: string;
    lines: MovementPayload['lines']; reference_document?: string | null;
    reason?: string | null; idempotency_key?: string | null;
  }): Observable<Movement> {
    return this.http.post<Movement>(`${BASE}/movements/transfer`, payload);
  }

  reverse(lineId: string, reason: string): Observable<MovementLine> {
    return this.http.post<MovementLine>(`${BASE}/movements/reverse`, { line_id: lineId, reason });
  }

  movements(params: { product_id?: string; page?: number; size?: number } = {}): Observable<Movement[]> {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null) hp = hp.set(k, String(v)); });
    return this.http.get<Movement[]>(`${BASE}/movements`, { params: hp });
  }

  kardex(productId: string): Observable<KardexResult> {
    return this.http.get<KardexResult>(`${BASE}/stock/kardex`, { params: { product_id: productId } });
  }

  expiringLots(): Observable<ExpiringLot[]> {
    return this.http.get<ExpiringLot[]>(`${BASE}/stock/lots/expiring`);
  }

  lots(productId?: string): Observable<Lot[]> {
    return this.http.get<Lot[]>(`${BASE}/lots`, { params: productId ? { product_id: productId } : {} });
  }

  createLot(p: {
    product_id: string; lot_number: string; variant_id?: string | null; supplier_name?: string | null;
    manufactured_at?: string | null; expiry_date?: string | null; acquisition_cost?: string | null;
    notes?: string | null;
  }): Observable<Lot> {
    return this.http.post<Lot>(`${BASE}/lots`, p);
  }

  patchLot(id: string, p: { status?: string; expiry_date?: string; notes?: string }): Observable<Lot> {
    return this.http.patch<Lot>(`${BASE}/lots/${id}`, p);
  }

  reconcile(): Observable<{ ok: boolean; mismatches: unknown[] }> {
    return this.http.post<{ ok: boolean; mismatches: unknown[] }>(`${BASE}/stock/reconcile`, {});
  }
}
