import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { V1PurchasesService, PurchaseOrder, POStatus, Supplier, GoodsReceipt } from '../../../core/v1/purchases.service';
import { V1CatalogService, Product } from '../../../core/v1/catalog.service';
import { V1PlatformService, Warehouse } from '../../../core/v1/platform.service';
import { StatusPillComponent, ToastService } from '../../../shared/ui';
import { apiErrorMessage } from '../../../core/v1/v1.interceptor';
import { SessionService } from '../../../core/v1/session.service';

@Component({
  selector: 'app-v1-purchases',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusPillComponent],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss',
})
export class PurchasesComponent implements OnInit {
  private readonly po = inject(V1PurchasesService);
  private readonly catalog = inject(V1CatalogService);
  private readonly platform = inject(V1PlatformService);
  private readonly toast = inject(ToastService);
  readonly session = inject(SessionService);

  readonly orders = signal<PurchaseOrder[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly products = signal<Product[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly loading = signal(true);
  readonly detail = signal<PurchaseOrder | null>(null);
  readonly showForm = signal(false);
  readonly saving = signal(false);

  formSupplier = signal('');
  formWarehouse = signal('');
  formLines = signal<{ product_id: string; quantity: string; unit_cost: string }[]>([
    { product_id: '', quantity: '1', unit_cost: '0' },
  ]);

  receiveFor = signal<PurchaseOrder | null>(null);
  receiveLines = signal<{ po_line_id: string; quantity: string; lot_number: string; expiry_date: string }[]>([]);
  receiveInvoice = signal('');

  ngOnInit(): void {
    this.load();
    this.po.suppliers().subscribe({ next: (s) => this.suppliers.set(s), error: () => {} });
    this.catalog.products({ size: 200 }).subscribe({ next: (p) => this.products.set(p), error: () => {} });
    this.platform.warehouses().subscribe({ next: (w) => { this.warehouses.set(w); this.formWarehouse.set(w[0]?.id ?? ''); }, error: () => {} });
  }

  load(): void {
    this.loading.set(true);
    this.po.orders().subscribe({
      next: (o) => { this.orders.set(o); this.loading.set(false); },
      error: (err) => { this.toast.error(err); this.loading.set(false); },
    });
  }

  readonly allReceipts = signal<GoodsReceipt[]>([]);
  readonly voidFor = signal<GoodsReceipt | null>(null);
  voidReason = '';

  open(p: PurchaseOrder): void {
    this.detail.set(p);
    this.po.receipts().subscribe({ next: (r) => this.allReceipts.set(r), error: () => {} });
  }
  receiptsOf(po: PurchaseOrder): GoodsReceipt[] {
    return this.allReceipts().filter((r) => r.order_id === po.id);
  }
  receiptQty(r: GoodsReceipt): string {
    return r.lines.reduce((s, l) => s + Number(l.quantity), 0).toString();
  }
  canVoidReceipt(r: GoodsReceipt): boolean {
    return r.status === 'confirmed' && this.session.can('inventario.ajustes.aprobar');
  }
  openVoid(r: GoodsReceipt): void { this.voidReason = ''; this.voidFor.set(r); }
  confirmVoid(): void {
    const r = this.voidFor();
    const po = this.detail();
    const reason = this.voidReason.trim();
    if (!r || !po) return;
    if (reason.length < 3) { this.toast.warn('Escriba el motivo de la anulación (mín. 3 caracteres)'); return; }
    this.po.voidReceipt(po.id, r.id, reason).subscribe({
      next: () => {
        this.toast.ok(`Recepción ${r.document_number} anulada: existencias y orden actualizadas`);
        this.voidFor.set(null);
        this.po.orders().subscribe({
          next: (list) => { this.orders.set(list); this.detail.set(list.find((x) => x.id === po.id) ?? null); },
          error: (err) => this.toast.error(err),
        });
        this.po.receipts().subscribe({ next: (rs) => this.allReceipts.set(rs), error: () => {} });
      },
      error: (err) => this.toast.error(err),
    });
  }

  addLine(): void { this.formLines.update((l) => [...l, { product_id: '', quantity: '1', unit_cost: '0' }]); }
  removeLine(i: number): void { this.formLines.update((l) => l.filter((_, idx) => idx !== i)); }
  setLine(i: number, k: 'product_id' | 'quantity' | 'unit_cost', v: string): void {
    this.formLines.update((l) => l.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  }

  create(): void {
    if (!this.formSupplier() || !this.formWarehouse()) { this.toast.warn('Seleccione proveedor y bodega'); return; }
    const lines = this.formLines().filter((l) => l.product_id && Number(l.quantity) > 0);
    if (!lines.length) { this.toast.warn('Agregue al menos una línea válida'); return; }
    this.saving.set(true);
    this.po.createOrder({
      supplier_id: this.formSupplier(),
      warehouse_id: this.formWarehouse(),
      auto_approve: false,
      lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_cost: l.unit_cost })),
    }).subscribe({
      next: (p) => {
        this.saving.set(false);
        this.showForm.set(false);
        this.formLines.set([{ product_id: '', quantity: '1', unit_cost: '0' }]);
        this.toast.ok(`Orden ${p.document_number} creada`);
        this.load();
      },
      error: (err) => { this.saving.set(false); this.toast.error(err); },
    });
  }

  approve(p: PurchaseOrder): void {
    this.po.approve(p.id).subscribe({
      next: () => { this.toast.ok(`Orden ${p.document_number} aprobada`); this.load(); this.detail.set(null); },
      error: (err) => this.toast.error(err),
    });
  }

  openReceive(p: PurchaseOrder): void {
    this.receiveFor.set(p);
    this.receiveInvoice.set('');
    this.receiveLines.set(
      p.lines
        .filter((l) => Number(l.quantity_received) < Number(l.quantity_ordered))
        .map((l) => ({
          po_line_id: l.id,
          quantity: String(Number(l.quantity_ordered) - Number(l.quantity_received)),
          lot_number: '',
          expiry_date: '',
        }))
    );
  }

  setReceive(i: number, k: 'quantity' | 'lot_number' | 'expiry_date', v: string): void {
    this.receiveLines.update((l) => l.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  }

  receive(): void {
    const p = this.receiveFor();
    if (!p) return;
    const lines = this.receiveLines().filter((l) => Number(l.quantity) > 0);
    if (!lines.length) { this.toast.warn('Indique cantidades recibidas'); return; }
    this.po.receive(p.id, {
      received: lines.map((l) => ({
        po_line_id: l.po_line_id,
        quantity: l.quantity,
        lot_number: l.lot_number || null,
        expiry_date: l.expiry_date || null,
      })),
      supplier_invoice_number: this.receiveInvoice() || null,
    }).subscribe({
      next: (r) => {
        this.toast.ok(`Recepción ${r.document_number} registrada`);
        this.receiveFor.set(null);
        this.load();
      },
      error: (err) => this.toast.error(err),
    });
  }

  statusFilter = signal<POStatus | ''>('');
  byFilter(): PurchaseOrder[] {
    const s = this.statusFilter();
    return s ? this.orders().filter((o) => o.status === s) : this.orders();
  }

  productName(id: string): string {
    const p = this.products().find((x) => x.id === id);
    return p ? `${p.sku} · ${p.name}` : id.slice(0, 6);
  }

  totalOf(o: PurchaseOrder): string {
    return o.lines.reduce((s, l) => s + Number(l.amount_total), 0).toFixed(2);
  }
  lineProduct(po: PurchaseOrder, lineId: string): string {
    return po.lines.find((l) => l.id === lineId)?.product_id ?? '';
  }
  productHasLots(productId: string): boolean {
    return !!this.products().find((p) => p.id === productId)?.track_lots;
  }

  readonly cancelFor = signal<PurchaseOrder | null>(null);
  cancelReason = '';

  /** Se puede cancelar mientras no haya recepciones y el estado lo permita (regla del backend). */
  canCancelOrder(o: PurchaseOrder): boolean {
    return this.canPo() && (o.status === 'draft' || o.status === 'approved' || o.status === 'pending_approval')
      && o.lines.every((l) => Number(l.quantity_received) === 0);
  }
  cancelBlockReason(o: PurchaseOrder): string | null {
    if (o.status === 'cancelled') return 'La orden ya está cancelada.';
    if (o.status === 'received' || o.status === 'closed') return 'La orden ya fue recibida y no se puede cancelar.';
    if (o.lines.some((l) => Number(l.quantity_received) > 0)) {
      return 'Tiene mercadería recibida. Anule primero la recepción para poder cancelar la orden.';
    }
    return null;
  }
  openCancel(o: PurchaseOrder): void { this.cancelReason = ''; this.cancelFor.set(o); }
  confirmCancel(): void {
    const o = this.cancelFor();
    const reason = this.cancelReason.trim();
    if (!o) return;
    if (reason.length < 3) { this.toast.warn('Escriba el motivo de la cancelación (mín. 3 caracteres)'); return; }
    this.po.cancel(o.id, reason).subscribe({
      next: () => {
        this.toast.ok(`Orden ${o.document_number} cancelada`);
        this.cancelFor.set(null);
        this.detail.set(null);
        this.load();
      },
      error: (err) => this.toast.error(err),
    });
  }

  canPo(): boolean { return this.session.can('compras.ordenes.crear'); }
  canApprove(): boolean { return this.session.can('compras.ordenes.aprobar'); }
  canReceive(): boolean { return this.session.can('compras.recepciones.registrar'); }
}
