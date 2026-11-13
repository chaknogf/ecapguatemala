import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = '/api/v1';

export interface Customer {
  id: string; code: string; party_type: 'individual' | 'company'; name: string;
  tax_id: string | null; email: string | null; phone: string | null; address: string | null;
  credit_limit: string | null; payment_terms_days: number; max_discount_pct: string;
  status: 'active' | 'inactive' | 'blocked'; notes: string | null; labels: string[];
}

export type SOStatus = 'draft' | 'confirmed' | 'partial' | 'dispatched' | 'invoiced' | 'cancelled';

export interface SOLine {
  id: string; line_no: number; product_id: string; variant_id: string | null;
  quantity: string; unit_price_net: string; discount_pct: string; tax_rate_pct: string | null;
  amount_net: string; tax_amount: string; amount_total: string;
  quantity_reserved: string; quantity_dispatched: string; quantity_invoiced: string; cost_snapshot: string;
}

export interface SalesOrder {
  id: string; document_number: string; status: SOStatus; customer_id: string;
  warehouse_id: string; salesperson_id: string | null; branch_id: string | null;
  order_date: string; notes: string | null; lines: SOLine[];
}

export interface DispatchLine {
  id: string; so_line_id: string; line_no: number; quantity: string;
  lot_id: string | null; unit_cost: string; movement_line_id: string;
}

export interface Dispatch {
  id: string; document_number: string; order_id: string; warehouse_id: string;
  dispatched_at: string; movement_id: string; lines: DispatchLine[];
}

export interface InvoiceLine {
  id: string; line_no: number; product_id: string | null; description_snapshot: string;
  quantity: string; unit_price_net: string; base: string; tax_rate_pct: string | null;
  tax_amount: string; total: string;
}

export interface InvoiceTotals {
  subtotal: string; discount_total: string; base_total: string; tax_total: string;
  grand_total: string; tax_breakdown: Record<string, { rate: string; base: string; tax: string }>;
}

export interface Invoice {
  id: string; document_number: string; status: string; customer_id: string;
  order_id: string | null; issue_date: string; due_date: string | null; currency_code: string;
  payment_type: string; customer_snapshot: Record<string, string | null>; totals: InvoiceTotals;
  is_credit_note: boolean; cancelled_reason: string | null; annulled_by: string | null; lines: InvoiceLine[];
}

export interface Payment { id: string; document_number: string; invoice_id: string | null; amount: string; paid_at: string; reference: string | null }
export interface PaymentMethod { id: string; code: string; name: string; kind: string; active: boolean }
export interface Salesperson { id: string; code: string; name: string; user_id: string | null; commission_pct: string; active: boolean }

export interface Receivable {
  invoice_id: string; document: string; customer: string; issue_date: string; due_date: string | null;
  total: string; paid: string; balance: string; days_late: number; bucket: string;
}

@Injectable({ providedIn: 'root' })
export class V1SalesService {
  private readonly http = inject(HttpClient);

  customers(q?: string): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${BASE}/customers`, { params: q ? { q } : {} });
  }
  createCustomer(p: Partial<Customer> & { code: string; name: string }): Observable<Customer> {
    return this.http.post<Customer>(`${BASE}/customers`, p);
  }

  salespeople(): Observable<Salesperson[]> { return this.http.get<Salesperson[]>(`${BASE}/salespeople`); }

  orders(status?: SOStatus): Observable<SalesOrder[]> {
    return this.http.get<SalesOrder[]>(`${BASE}/sales-orders`, { params: status ? { status } : {} });
  }
  createOrder(p: {
    customer_id: string; warehouse_id: string; branch_id?: string | null; salesperson_id?: string | null;
    notes?: string | null;
    lines: { product_id: string; variant_id?: string | null; quantity: string; unit_price?: string | null;
             discount_pct?: string; tax_rate_pct?: string | null; tax_included?: boolean }[];
  }): Observable<SalesOrder> {
    return this.http.post<SalesOrder>(`${BASE}/sales-orders`, p);
  }
  confirm(id: string): Observable<SalesOrder> {
    return this.http.post<SalesOrder>(`${BASE}/sales-orders/${id}/confirm`, {});
  }
  dispatch(id: string, items?: { so_line_id: string; quantity: string; lot_id?: string | null }[]): Observable<Dispatch> {
    return this.http.post<Dispatch>(`${BASE}/sales-orders/${id}/dispatch`, { items: items ?? null });
  }
  cancel(id: string, reason: string): Observable<SalesOrder> {
    return this.http.post<SalesOrder>(`${BASE}/sales-orders/${id}/cancel`, { reason });
  }

  invoices(): Observable<Invoice[]> { return this.http.get<Invoice[]>(`${BASE}/invoices`); }
  invoiceFromOrder(orderId: string, paymentType: 'cash' | 'credit', idem?: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${BASE}/invoices`, {
      order_id: orderId, payment_type: paymentType, idempotency_key: idem ?? null,
    });
  }
  annulInvoice(invoiceId: string, reason: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${BASE}/invoices/${invoiceId}/credit-note`, { reason });
  }
  paymentMethods(): Observable<PaymentMethod[]> { return this.http.get<PaymentMethod[]>(`${BASE}/payment-methods`); }
  createMethod(p: { code: string; name: string; kind: string }): Observable<PaymentMethod> {
    return this.http.post<PaymentMethod>(`${BASE}/payment-methods`, p);
  }
  pay(p: { invoice_id: string; amount: string; payment_method_id: string; reference?: string; idempotency_key?: string | null }): Observable<Payment> {
    return this.http.post<Payment>(`${BASE}/payments`, p);
  }
  receivables(): Observable<Receivable[]> { return this.http.get<Receivable[]>(`${BASE}/receivables`); }
}
