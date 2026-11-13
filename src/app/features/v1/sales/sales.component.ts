import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { V1SalesService, Customer, SalesOrder, SOStatus, Invoice, PaymentMethod, Receivable } from '../../../core/v1/sales.service';
import { V1CatalogService, Product } from '../../../core/v1/catalog.service';
import { V1PlatformService, Warehouse } from '../../../core/v1/platform.service';
import { StatusPillComponent, ToastService } from '../../../shared/ui';
import { SessionService } from '../../../core/v1/session.service';

@Component({
  selector: 'app-v1-sales',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusPillComponent],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss',
})
export class SalesComponent implements OnInit {
  private readonly sales = inject(V1SalesService);
  private readonly catalog = inject(V1CatalogService);
  private readonly platform = inject(V1PlatformService);
  private readonly toast = inject(ToastService);
  readonly session = inject(SessionService);

  readonly orders = signal<SalesOrder[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly products = signal<Product[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly invoices = signal<Invoice[]>([]);
  readonly receivables = signal<Receivable[]>([]);
  readonly methods = signal<PaymentMethod[]>([]);
  readonly loading = signal(true);
  readonly tab = signal<'orders' | 'invoices'>('orders');

  // nueva orden
  readonly showForm = signal(false);
  readonly saving = signal(false);
  formCustomer = signal('');
  formWarehouse = signal('');
  formLines = signal<{ product_id: string; quantity: string; unit_price: string; discount_pct: string; tax_rate_pct: string }[]>([
    { product_id: '', quantity: '1', unit_price: '', discount_pct: '0', tax_rate_pct: '' },
  ]);

  // dispatch/invoice/pay modals
  readonly dispatchFor = signal<SalesOrder | null>(null);
  readonly invoiceFor = signal<SalesOrder | null>(null);
  readonly payFor = signal<Invoice | null>(null);
  payAmount = signal('');
  payMethod = signal('');
  readonly cashSale = signal(false);

  ngOnInit(): void {
    this.load();
    this.sales.customers().subscribe({ next: (c) => this.customers.set(c), error: () => {} });
    this.catalog.products({ size: 200 }).subscribe({ next: (p) => this.products.set(p), error: () => {} });
    this.platform.warehouses().subscribe({ next: (w) => { this.warehouses.set(w); this.formWarehouse.set(w[0]?.id ?? ''); }, error: () => {} });
    this.sales.paymentMethods().subscribe({ next: (m) => { this.methods.set(m); this.payMethod.set(m[0]?.id ?? ''); }, error: () => {} });
    this.sales.receivables().subscribe({ next: (r) => this.receivables.set(r), error: () => {} });
  }

  load(): void {
    this.loading.set(true);
    this.sales.orders().subscribe({
      next: (o) => { this.orders.set(o); this.loading.set(false); },
      error: (err) => { this.toast.error(err); this.loading.set(false); },
    });
    this.sales.invoices().subscribe({ next: (i) => this.invoices.set(i), error: () => {} });
    this.sales.receivables().subscribe({ next: (r) => this.receivables.set(r), error: () => {} });
  }

  addLine(): void { this.formLines.update((l) => [...l, { product_id: '', quantity: '1', unit_price: '', discount_pct: '0', tax_rate_pct: '' }]); }
  removeLine(i: number): void { this.formLines.update((l) => l.filter((_, idx) => idx !== i)); }
  setLine(i: number, k: 'product_id' | 'quantity' | 'unit_price' | 'discount_pct' | 'tax_rate_pct', v: string): void {
    this.formLines.update((l) => l.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  }

  createOrder(): void {
    if (!this.formCustomer() || !this.formWarehouse()) { this.toast.warn('Seleccione cliente y bodega'); return; }
    const lines = this.formLines().filter((l) => l.product_id && Number(l.quantity) > 0);
    if (!lines.length) { this.toast.warn('Agregue líneas válidas'); return; }
    this.saving.set(true);
    this.sales.createOrder({
      customer_id: this.formCustomer(),
      warehouse_id: this.formWarehouse(),
      lines: lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price || undefined,
        discount_pct: l.discount_pct || '0',
        tax_rate_pct: l.tax_rate_pct || undefined,
      })),
    }).subscribe({
      next: (o) => {
        this.saving.set(false);
        this.showForm.set(false);
        this.formLines.set([{ product_id: '', quantity: '1', unit_price: '', discount_pct: '0', tax_rate_pct: '' }]);
        this.toast.ok(`Pedido ${o.document_number} creado`);
        this.load();
      },
      error: (err) => { this.saving.set(false); this.toast.error(err); },
    });
  }

  readonly cancelFor = signal<SalesOrder | null>(null);
  cancelReason = '';

  /** Regla del backend: solo borradores o confirmados sin despachos. */
  canCancelOrder(o: SalesOrder): boolean {
    return this.canSo() && (o.status === 'draft' || o.status === 'confirmed');
  }
  openCancel(o: SalesOrder): void { this.cancelReason = ''; this.cancelFor.set(o); }
  confirmCancel(): void {
    const o = this.cancelFor();
    const reason = this.cancelReason.trim();
    if (!o) return;
    if (reason.length < 3) { this.toast.warn('Escriba el motivo de la cancelación (mín. 3 caracteres)'); return; }
    this.sales.cancel(o.id, reason).subscribe({
      next: () => { this.toast.ok(`Pedido ${o.document_number} cancelado`); this.cancelFor.set(null); this.load(); },
      error: (err) => this.toast.error(err),
    });
  }

  confirmOrder(o: SalesOrder): void {
    this.sales.confirm(o.id).subscribe({
      next: () => { this.toast.ok('Existencias reservadas (FEFO)'); this.load(); },
      error: (err) => this.toast.error(err),
    });
  }

  openDispatch(o: SalesOrder): void { this.dispatchFor.set(o); }

  readonly dispatchQtys = signal<Record<string, string>>({});

  setDispatchQty(lineId: string, v: string): void {
    this.dispatchQtys.update((m) => ({ ...m, [lineId]: v }));
  }

  dispatchValue(line: { id: string; quantity: string; quantity_dispatched: string }): string {
    return this.dispatchQtys()[line.id] ?? this.dispatchPending(line);
  }

  dispatchPending(line: { quantity: string; quantity_dispatched: string }): string {
    return String(Number(line.quantity) - Number(line.quantity_dispatched));
  }

  dispatch(): void {
    const o = this.dispatchFor();
    if (!o) return;
    const items = o.lines
      .map((l) => ({ so_line_id: l.id, quantity: this.dispatchQtys()[l.id] || this.dispatchPending(l) }))
      .filter((i) => Number(i.quantity) > 0);
    this.sales.dispatch(o.id, items).subscribe({
      next: (d) => { this.toast.ok(`Despacho ${d.document_number} registrado`); this.dispatchFor.set(null); this.dispatchQtys.set({}); this.load(); },
      error: (err) => this.toast.error(err),
    });
  }

  /** Unidades despachadas que aún no se han facturado (la factura cubre solo esto). */
  pendingToInvoice(o: SalesOrder): number {
    return o.lines.reduce((s, l) => s + Math.max(0, Number(l.quantity_dispatched) - Number(l.quantity_invoiced)), 0);
  }
  canInvoiceOrder(o: SalesOrder): boolean {
    return (o.status === 'dispatched' || o.status === 'partial') && this.canInvoice() && this.pendingToInvoice(o) > 0;
  }
  /** Progreso visible del pedido: despachado / total y facturado / total, en unidades. */
  progress(o: SalesOrder): { dispatched: number; invoiced: number; total: number } {
    return o.lines.reduce(
      (acc, l) => ({
        dispatched: acc.dispatched + Number(l.quantity_dispatched),
        invoiced: acc.invoiced + Number(l.quantity_invoiced),
        total: acc.total + Number(l.quantity),
      }),
      { dispatched: 0, invoiced: 0, total: 0 }
    );
  }
  readonly annulFor = signal<Invoice | null>(null);
  annulReason = '';
  canAnnul(i: Invoice): boolean {
    return this.canInvoice() && !i.is_credit_note && !i.annulled_by && i.status === 'issued';
  }
  openAnnul(i: Invoice): void { this.annulReason = ''; this.annulFor.set(i); }
  confirmAnnul(): void {
    const i = this.annulFor();
    const reason = this.annulReason.trim();
    if (!i) return;
    if (reason.length < 3) { this.toast.warn('Escriba el motivo de la anulación (mín. 3 caracteres)'); return; }
    this.sales.annulInvoice(i.id, reason).subscribe({
      next: (note) => {
        this.toast.ok(`Factura ${i.document_number} anulada con nota de crédito ${note.document_number}`);
        this.annulFor.set(null);
        this.load();
      },
      error: (err) => this.toast.error(err),
    });
  }
  openInvoice(o: SalesOrder): void { this.invoiceFor.set(o); this.cashSale.set(false); }

  invoice(): void {
    const o = this.invoiceFor();
    if (!o) return;
    this.sales.invoiceFromOrder(o.id, this.cashSale() ? 'cash' : 'credit', crypto.randomUUID()).subscribe({
      next: (i) => {
        this.toast.ok(`Factura ${i.document_number} emitida`);
        this.invoiceFor.set(null);
        this.load();
      },
      error: (err) => this.toast.error(err),
    });
  }

  openPay(i: Invoice): void { this.payFor.set(i); this.payAmount.set(this.balanceOf(i)); }

  balanceOf(i: Invoice): string {
    const r = this.receivables().find((x) => x.invoice_id === i.id);
    return r ? r.balance : (i.totals?.grand_total ?? '0');
  }

  pay(): void {
    const i = this.payFor();
    const amt = this.payAmount();
    const pm = this.payMethod();
    if (!i || !amt || Number(amt) <= 0 || !pm) { this.toast.warn('Indique monto y método'); return; }
    this.sales.pay({ invoice_id: i.id, amount: amt, payment_method_id: pm, idempotency_key: crypto.randomUUID() }).subscribe({
      next: () => { this.toast.ok('Pago registrado'); this.payFor.set(null); this.load(); },
      error: (err) => this.toast.error(err),
    });
  }

  customerName(id: string): string { return this.customers().find((c) => c.id === id)?.name ?? id.slice(0, 6); }
  productName(id: string): string { const p = this.products().find((x) => x.id === id); return p ? `${p.sku} · ${p.name}` : id.slice(0, 6); }
  methodName(id: string): string { return this.methods().find((m) => m.id === id)?.name ?? '—'; }

  statusFilter = signal<SOStatus | ''>('');
  byFilter(): SalesOrder[] {
    const s = this.statusFilter();
    return s ? this.orders().filter((o) => o.status === s) : this.orders();
  }

  total(o: SalesOrder): string {
    return o.lines.reduce((s, l) => s + Number(l.amount_total), 0).toFixed(2);
  }
  payInvoice(r: Receivable): void {
    const inv = this.invoices().find((i) => i.id === r.invoice_id);
    if (inv) this.openPay(inv);
  }

  canSo(): boolean { return this.session.can('ventas.pedidos.crear'); }
  canDispatch(): boolean { return this.session.can('ventas.despachos.*'); }
  canInvoice(): boolean { return this.session.can('ventas.facturas.emitir'); }
  canPay(): boolean { return this.session.can('ventas.pagos.*'); }
}
