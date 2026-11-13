import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { V1InventoryService, StockView, ExpiringLot } from '../../../core/v1/inventory.service';
import { V1PlatformService, Warehouse } from '../../../core/v1/platform.service';
import { LightChipComponent, ToastService } from '../../../shared/ui';
import { SessionService } from '../../../core/v1/session.service';

@Component({
  selector: 'app-v1-stock',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LightChipComponent],
  templateUrl: './stock.component.html',
  styleUrl: './stock.component.scss',
})
export class StockComponent implements OnInit {
  private readonly inv = inject(V1InventoryService);
  private readonly platform = inject(V1PlatformService);
  private readonly toast = inject(ToastService);
  readonly session = inject(SessionService);

  readonly rows = signal<StockView[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly expiring = signal<ExpiringLot[]>([]);
  readonly loading = signal(true);
  readonly whFilter = signal('');
  readonly onlyLow = signal(false);
  readonly showExpiring = signal(true);

  ngOnInit(): void {
    this.platform.warehouses().subscribe({ next: (w) => this.warehouses.set(w), error: () => {} });
    this.load();
    this.inv.expiringLots().subscribe({ next: (l) => this.expiring.set(l), error: () => {} });
  }

  load(): void {
    this.loading.set(true);
    const p: { warehouse_id?: string; only_low?: boolean } = {};
    if (this.whFilter()) p.warehouse_id = this.whFilter();
    if (this.onlyLow()) p.only_low = true;
    this.inv.stock(p).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: (err) => { this.toast.error(err); this.loading.set(false); },
    });
  }

  toggleLow(): void { this.onlyLow.update((v) => !v); this.load(); }

  whName(id: string): string {
    return this.warehouses().find((w) => w.id === id)?.code ?? id.slice(0, 6);
  }

  canMove(): boolean { return this.session.can('inventario.movimientos.crear'); }
}
