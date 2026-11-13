import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = '/api/v1';

export interface Supplier {
  id: string; code: string; name: string; tax_id: string | null; email: string | null;
  phone: string | null; address: string | null; payment_terms_days: number;
  status: 'active' | 'inactive' | 'blocked'; notes: string | null;
}

export type POStatus = 'draft' | 'pending_approval' | 'approved' | 'partial' | 'received' | 'cancelled' | 'closed';

export interface POLine {
  id: string; line_no: number; product_id: string; variant_id: string | null;
  quantity_ordered: string; quantity_received: string; unit_cost: string;
  discount_pct: string; tax_rate_pct: string | null; amount_net: string;
  tax_amount: string; amount_total: string;
}

export interface PurchaseOrder {
  id: string; document_number: string; status: POStatus; supplier_id: string;
  warehouse_id: string; branch_id: string | null; order_date: string;
  expected_date: string | null; notes: string | null; created_by_id: string;
  approved_by_id: string | null; lines: POLine[];
}

export interface ReceiptLine {
  id: string; po_line_id: string; line_no: number; quantity: string; unit_cost: string;
  lot_id: string | null; expiry_date: string | null; lot_number: string | null;
}

export interface GoodsReceipt {
  id: string; document_number: string; order_id: string; warehouse_id: string;
  status: string; supplier_invoice_number: string | null; additional_expenses: string;
  movement_id: string | null; cancelled_reason: string | null; lines: ReceiptLine[];
}

@Injectable({ providedIn: 'root' })
export class V1PurchasesService {
  private readonly http = inject(HttpClient);

  suppliers(q?: string): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(`${BASE}/suppliers`, { params: q ? { q } : {} });
  }
  createSupplier(p: Partial<Supplier> & { code: string; name: string }): Observable<Supplier> {
    return this.http.post<Supplier>(`${BASE}/suppliers`, p);
  }

  orders(status?: POStatus): Observable<PurchaseOrder[]> {
    let hp = new HttpParams();
    if (status) hp = hp.set('status', status);
    return this.http.get<PurchaseOrder[]>(`${BASE}/purchase-orders`, { params: hp });
  }
  order(id: string): Observable<PurchaseOrder> {
    return this.http.get<PurchaseOrder>(`${BASE}/purchase-orders/${id}`);
  }
  createOrder(p: {
    supplier_id: string; warehouse_id: string; branch_id?: string | null; expected_date?: string | null;
    notes?: string | null; auto_approve?: boolean; idempotency_key?: string | null;
    lines: { product_id: string; variant_id?: string | null; quantity: string; unit_cost: string;
             discount_pct?: string; tax_rate_pct?: string | null; tax_included?: boolean }[];
  }): Observable<PurchaseOrder> {
    return this.http.post<PurchaseOrder>(`${BASE}/purchase-orders`, p);
  }
  approve(id: string): Observable<PurchaseOrder> {
    return this.http.post<PurchaseOrder>(`${BASE}/purchase-orders/${id}/approve`, {});
  }
  cancel(id: string, reason: string): Observable<PurchaseOrder> {
    return this.http.post<PurchaseOrder>(`${BASE}/purchase-orders/${id}/cancel`, { reason });
  }
  pending(id: string): Observable<{ pending: unknown[]; totals: Record<string, string> }> {
    return this.http.get<{ pending: unknown[]; totals: Record<string, string> }>(`${BASE}/purchase-orders/${id}/pending`);
  }
  receive(id: string, p: {
    received: { po_line_id: string; quantity: string; unit_cost?: string | null;
                lot_number?: string | null; expiry_date?: string | null }[];
    supplier_invoice_number?: string | null; additional_expenses?: string; idempotency_key?: string | null;
  }): Observable<GoodsReceipt> {
    return this.http.post<GoodsReceipt>(`${BASE}/purchase-orders/${id}/receipts`, p);
  }
  voidReceipt(poId: string, receiptId: string, reason: string): Observable<PurchaseOrder> {
    return this.http.post<PurchaseOrder>(`${BASE}/purchase-orders/${poId}/receipts/${receiptId}/void`, { reason });
  }
  receipts(): Observable<GoodsReceipt[]> {
    return this.http.get<GoodsReceipt[]>(`${BASE}/goods-receipts`);
  }
}
