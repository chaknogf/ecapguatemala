import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Lot, Movement, KardexEntry, V1InventoryService } from '../../../core/v1/inventory.service';
import { V1CatalogService, Product } from '../../../core/v1/catalog.service';
import { V1PlatformService, Warehouse } from '../../../core/v1/platform.service';
import { ConfirmModalComponent, ToastService } from '../../../shared/ui';
import { apiErrorMessage } from '../../../core/v1/v1.interceptor';

type Mode = 'entrada' | 'salida' | 'ajuste' | 'transferencia' | 'ajuste_lote';

const TYPES_BY_MODE: Record<Mode, string[]> = {
  entrada: ['receipt', 'return_in', 'production_in'],
  salida: ['return_out', 'production_out', 'damage', 'expired'],
  ajuste: ['adjustment'],
  transferencia: ['transfer'],
  ajuste_lote: ['quarantine', 'blocked', 'release', 'expiry_fix'],
};

@Component({
  selector: 'app-v1-movements',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ConfirmModalComponent],
  templateUrl: './movements.component.html',
  styleUrl: './movements.component.scss',
})
export class MovementsComponent implements OnInit {
  private readonly inv = inject(V1InventoryService);
  private readonly catalog = inject(V1CatalogService);
  private readonly platform = inject(V1PlatformService);
  private readonly toast = inject(ToastService);
  private readonly confirm = viewChild<ConfirmModalComponent>('cm');

  readonly mode = signal<Mode>('entrada');
  readonly products = signal<Product[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);

  // formulario de línea
  readonly productId = signal('');
  readonly qty = signal('1');
  readonly unitCost = signal('');
  readonly warehouseId = signal('');
  readonly toWarehouseId = signal('');
  readonly reference = signal('');
  readonly reason = signal('');
  readonly counterparty = signal('');
  readonly fefo = signal(true);
  readonly lotForOut = signal('');
  readonly lotForm = signal({ lot_number: '', expiry_date: '', acquisition_cost: '' });
  readonly saving = signal(false);

  // kardex
  readonly kardexProduct = signal('');
  readonly kardex = signal<KardexEntry[]>([]);
  readonly kardexMeta = signal({ opening: '', final: '', sku: '', reconciled: false });
  readonly recent = signal<Movement[]>([]);

  // reverso
  readonly reversingLine = signal<string | null>(null);
  readonly reverseReason = signal('');

  readonly types = computed(() => TYPES_BY_MODE[this.mode()]);
  readonly selectedType = signal('receipt');
  readonly selectedProduct = computed(() =>
    this.products().find((p) => p.id === this.productId()) ?? null
  );

  ngOnInit(): void {
    this.catalog.products({ size: 200 }).subscribe({ next: (p) => this.products.set(p), error: () => {} });
    this.platform.warehouses().subscribe({ next: (w) => { this.warehouses.set(w); this.warehouseId.set(w[0]?.id ?? ''); }, error: () => {} });
    this.loadRecent();
    const first = this.products();
    if (first.length) { this.productId.set(first[0].id); }
  }

  setMode(m: Mode): void {
    this.mode.set(m);
    const list = TYPES_BY_MODE[m];
    this.selectedType.set(list[0]);
    if (m === 'ajuste' || m === 'transferencia') this.fefo.set(false);
    if (m === 'entrada') this.selectedType.set('receipt');
    if (m === 'salida') this.selectedType.set('return_out');
  }

  private loadRecent(): void {
    this.inv.movements({ size: 15 }).subscribe({ next: (m) => this.recent.set(m), error: () => {} });
  }

  async submit(): Promise<void> {
    const m = this.mode();
    if (!this.productId()) { this.toast.warn('Seleccione un producto'); return; }
    const q = this.qty();
    if (!q || Number(q) <= 0) { this.toast.warn('Cantidad inválida'); return; }

    if (m === 'ajuste_lote') {
      this.applyLotStatus();
      return;
    }

    const payload = this.buildPayload();
    if (!payload) return;

    if (m === 'ajuste' && !this.reason().trim()) {
      this.toast.warn('El ajuste exige un motivo');
      return;
    }
    if (m === 'ajuste' || m === 'salida') {
      const ok = await this.confirmAsk(
        m === 'ajuste' ? 'Confirmar ajuste' : 'Registrar salida',
        m === 'ajuste'
          ? 'El ajuste modifica existencias y queda auditado con su motivo. No puede editarse; solo revertirse.'
          : 'Se registrará la salida y descontará existencias de forma inmutable.'
      );
      if (!ok) return;
    }

    this.saving.set(true);
    try {
      if (m === 'transferencia') {
        await this.firstValue(this.inv.transfer(payload as never));
        this.toast.ok('Transferencia registrada');
      } else {
        await this.firstValue(this.inv.movement(payload as never));
        this.toast.ok('Movimiento registrado');
      }
      this.qty.set('1');
      this.unitCost.set('');
      this.reason.set('');
      this.counterparty.set('');
      this.rotateIdem();
      this.loadRecent();
      if (this.kardexProduct() === this.productId()) this.loadKardex();
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  private buildPayload(): Record<string, unknown> | null {
    const m = this.mode();
    const line: Record<string, unknown> = {
      product_id: this.productId(),
      quantity: m === 'ajuste' ? this.adjustTotal : this.qty(),
    };
    if (this.unitCost()) line['unit_cost'] = this.unitCost();
    if (this.lotForOut()) line['lot_id'] = this.lotForOut();

    if (m === 'transferencia') {
      if (!this.warehouseId() || !this.toWarehouseId() || this.warehouseId() === this.toWarehouseId()) {
        this.toast.warn('Elija bodegas de origen y destino distintas');
        return null;
      }
      return {
        from_warehouse_id: this.warehouseId(),
        to_warehouse_id: this.toWarehouseId(),
        lines: [line],
        reference_document: this.reference() || null,
        reason: this.reason() || 'Transferencia entre bodegas',
        idempotency_key: this.idem(),
      };
    }
    if (!this.warehouseId()) { this.toast.warn('Seleccione la bodega'); return null; }
    const body: Record<string, unknown> = {
      movement_type: this.selectedType(),
      warehouse_id: this.warehouseId(),
      lines: [line],
      reference_document: this.reference() || null,
      counterparty: this.counterparty() || null,
      idempotency_key: this.idem(),
    };
    if (this.reason()) body['reason'] = this.reason();
    if (m === 'salida' && this.fefo() && !this.lotForOut()) body['auto_pick'] = 'fefo';
    return body;
  }

  adjustDir = signal<'+' | '-'>('+');
  setAdjustDir(d: '+' | '-'): void { this.adjustDir.set(d); }
  get adjustTotal(): string {
    const q = Math.abs(Number(this.qty() || 0));
    return this.adjustDir() === '+' ? String(q) : String(-q);
  }

  private _idem = crypto.randomUUID();
  idem(): string | null {
    const v = this._idem;
    return v;
  }
  rotateIdem(): void { this._idem = crypto.randomUUID(); }

  setLot(k: 'lot_number' | 'expiry_date' | 'acquisition_cost', v: string): void {
    this.lotForm.update((f) => ({ ...f, [k]: v }));
  }

  // alta de lote para productos con control de lotes
  showLotForm = signal(false);
  async createLot(): Promise<void> {
    const f = this.lotForm();
    if (!this.productId() || !f.lot_number.trim()) { this.toast.warn('Indique producto y número de lote'); return; }
    try {
      const lot: Lot = await this.firstValue(this.inv.createLot({
        product_id: this.productId(),
        lot_number: f.lot_number.trim(),
        expiry_date: f.expiry_date || null,
        acquisition_cost: f.acquisition_cost || null,
      }));
      this.toast.ok(`Lote ${lot.lot_number} registrado`);
      this.lotForOut.set(lot.id);
      this.showLotForm.set(false);
      this.lotForm.set({ lot_number: '', expiry_date: '', acquisition_cost: '' });
    } catch (err) {
      this.toast.error(err);
    }
  }

  lotOptions = signal<{ id: string; lot_number: string; expiry_date: string | null }[]>([]);
  loadLots(): void {
    const pid = this.productId();
    if (!pid) { this.lotOptions.set([]); return; }
    this.inv.lots(pid).subscribe({
      next: (l) => this.lotOptions.set(l.map((x) => ({ id: x.id, lot_number: x.lot_number, expiry_date: x.expiry_date }))),
      error: () => this.lotOptions.set([]),
    });
  }

  onProductChange(): void {
    this.lotForOut.set('');
    this.loadLots();
    if (this.mode() === 'ajuste_lote') this.lotStatusOptions();
  }

  // estado del lote (cuarentena/bloqueo/liberación/fecha)
  targetLot = signal('');
  lotStatus = signal('quarantine');
  private lotStatusOptions(): void {
    const pid = this.productId();
    if (!pid) return;
    this.inv.lots(pid).subscribe({ next: (l) => { this.targetLot.set(l[0]?.id ?? ''); }, error: () => {} });
  }

  async applyLotStatus(): Promise<void> {
    const ok = await this.confirmAsk('Cambiar estado de lote',
      'La cuarentena/bloqueo impide vender el lote (queda trazado en auditoría).');
    if (!ok || !this.targetLot()) return;
    try {
      await this.firstValue(this.inv.patchLot(this.targetLot(), { status: this.lotStatus() }));
      this.toast.ok('Estado de lote actualizado');
    } catch (err) { this.toast.error(err); }
  }

  // kardex
  loadKardex(): void {
    const pid = this.kardexProduct();
    if (!pid) return;
    this.inv.kardex(pid).subscribe({
      next: (k) => {
        this.kardex.set(k.movements);
        this.kardexMeta.set({ opening: k.opening_balance, final: k.final_balance, sku: k.product_sku, reconciled: k.reconciled });
      },
      error: (err) => this.toast.error(err),
    });
  }

  // reverso de línea
  async askReverse(lineId: string): Promise<void> {
    const ok = await this.confirmAsk('Revertir movimiento',
      'No se elimina el original: se crea un movimiento compensatorio (REVERSO) con su motivo.');
    if (!ok) return;
    this.reversingLine.set(lineId);
    this.reverseReason.set('');
  }

  async confirmReverse(): Promise<void> {
    const line = this.reversingLine();
    const reason = this.reverseReason().trim();
    if (!line || reason.length < 3) { this.toast.warn('El reverso exige un motivo (mín. 3 caracteres)'); return; }
    try {
      await this.firstValue(this.inv.reverse(line, reason));
      this.toast.ok('Reverso registrado');
      this.reversingLine.set(null);
      this.loadRecent();
      if (this.kardexProduct()) this.loadKardex();
    } catch (err) { this.toast.error(err); }
  }

  async confirmAsk(title: string, message: string): Promise<boolean> {
    const cm = this.confirm();
    if (!cm) return true;
    return cm.ask({ title, message, danger: true, confirmLabel: 'Confirmar' });
  }

  firstValue<T>(obs: { subscribe(o: { next: (v: T) => void; error: (e: unknown) => void }): void }): Promise<T> {
    return new Promise((resolve, reject) => obs.subscribe({ next: resolve, error: (e) => reject(new Error(apiErrorMessage(e))) }));
  }

  typeLabel(t: string): string {
    return ({ receipt: 'Recepción', sale: 'Venta/despacho', return_in: 'Devolución entrante', return_out: 'Devolución saliente',
      damage: 'Merma', expired: 'Retiro vencido', adjustment: 'Ajuste', transfer: 'Transferencia',
      production_in: 'Producción', production_out: 'Consumo', reversal: 'Reverso' } as Record<string, string>)[t] ?? t;
  }

  whName(id: string): string { return this.warehouses().find((w) => w.id === id)?.code ?? id.slice(0, 6); }

  isOut(l: { quantity: string }): boolean { return Number(l.quantity) < 0; }
}
