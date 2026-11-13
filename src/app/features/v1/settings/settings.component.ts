import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { V1PlatformService, Company, Branch, Warehouse } from '../../../core/v1/platform.service';
import { V1CatalogService, Unit, Category, Brand, Tax, AttributeDef } from '../../../core/v1/catalog.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-v1-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private readonly platform = inject(V1PlatformService);
  private readonly catalog = inject(V1CatalogService);
  private readonly toast = inject(ToastService);

  readonly tab = signal<'empresa' | 'almacen' | 'maestros'>('empresa');
  readonly company = signal<Company | null>(null);
  readonly branches = signal<Branch[]>([]);
  readonly warehouses = signal<Warehouse[]>([]);
  readonly units = signal<Unit[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly brands = signal<Brand[]>([]);
  readonly taxes = signal<Tax[]>([]);
  readonly attributes = signal<AttributeDef[]>([]);
  readonly saving = signal(false);

  form = signal({ trade_name: '', tax_id: '', currency_code: 'GTQ', timezone: 'America/Guatemala', address: '', phone: '', email: '' });
  invPolicy = signal({ allow_negative: false, block_sale_expired_lots: true, valuation_method: 'weighted_average' });
  expPolicy = signal({ warn_days: '90', critical_days: '30' });

  newBranch = signal({ code: '', name: '' });
  newWh = signal({ branch_id: '', code: '', name: '' });

  ngOnInit(): void {
    this.platform.currentCompany().subscribe({
      next: (c) => {
        this.company.set(c);
        this.form.set({
          trade_name: c.trade_name, tax_id: c.tax_id ?? '', currency_code: c.currency_code,
          timezone: c.timezone, address: c.address ?? '', phone: c.phone ?? '', email: c.email ?? '',
        });
        const ip = c.inventory_policy as Record<string, unknown>;
        this.invPolicy.set({
          allow_negative: !!ip['allow_negative'],
          block_sale_expired_lots: ip['block_sale_expired_lots'] !== false,
          valuation_method: String(ip['valuation_method'] ?? 'weighted_average'),
        });
        const ep = c.expiry_policy as Record<string, unknown>;
        this.expPolicy.set({ warn_days: String(ep['warn_days'] ?? 90), critical_days: String(ep['critical_days'] ?? 30) });
      },
      error: (err) => this.toast.error(err),
    });
    this.loadMasters();
  }

  private loadMasters(): void {
    this.platform.branches().subscribe({ next: (b) => { this.branches.set(b); this.newWh.update((w) => ({ ...w, branch_id: b[0]?.id ?? '' })); }, error: () => {} });
    this.platform.warehouses().subscribe({ next: (w) => this.warehouses.set(w), error: () => {} });
    this.catalog.units().subscribe({ next: (u) => this.units.set(u), error: () => {} });
    this.catalog.categories().subscribe({ next: (c) => this.categories.set(c), error: () => {} });
    this.catalog.brands().subscribe({ next: (b) => this.brands.set(b), error: () => {} });
    this.catalog.taxes().subscribe({ next: (t) => this.taxes.set(t), error: () => {} });
    this.catalog.attributes().subscribe({ next: (a) => this.attributes.set(a), error: () => {} });
  }

  setForm(k: string, v: string): void {
    this.form.update((f) => ({ ...f, [k]: v }));
  }

  saveCompany(): void {
    const f = this.form();
    const ip = this.invPolicy();
    const ep = this.expPolicy();
    this.saving.set(true);
    this.platform.updateCompany({
      trade_name: f.trade_name, tax_id: f.tax_id || null, currency_code: f.currency_code,
      timezone: f.timezone, address: f.address || null, phone: f.phone || null, email: f.email || null,
      inventory_policy: {
        allow_negative: ip.allow_negative,
        block_sale_expired_lots: ip.block_sale_expired_lots,
        valuation_method: ip.valuation_method,
      },
      expiry_policy: { warn_days: Number(ep.warn_days), critical_days: Number(ep.critical_days) },
    }).subscribe({
      next: () => { this.saving.set(false); this.toast.ok('Configuración de empresa guardada'); },
      error: (err) => { this.saving.set(false); this.toast.error(err); },
    });
  }

  addBranch(): void {
    const b = this.newBranch();
    if (!b.code.trim() || !b.name.trim()) { this.toast.warn('Código y nombre requeridos'); return; }
    this.platform.createBranch({ code: b.code.trim(), name: b.name.trim() }).subscribe({
      next: () => { this.toast.ok('Sucursal creada'); this.newBranch.set({ code: '', name: '' }); this.loadMasters(); },
      error: (err) => this.toast.error(err),
    });
  }

  addWarehouse(): void {
    const w = this.newWh();
    if (!w.branch_id || !w.code.trim() || !w.name.trim()) { this.toast.warn('Complete sucursal, código y nombre'); return; }
    this.platform.createWarehouse({ branch_id: w.branch_id, code: w.code.trim(), name: w.name.trim() }).subscribe({
      next: () => { this.toast.ok('Bodega creada'); this.newWh.update((x) => ({ ...x, code: '', name: '' })); this.loadMasters(); },
      error: (err) => this.toast.error(err),
    });
  }

  setPolicy<K extends 'allow_negative' | 'block_sale_expired_lots'>(k: K, v: boolean): void { this.invPolicy.update((p) => ({ ...p, [k]: v })); }
  setExp(k: 'warn_days' | 'critical_days', v: string): void { this.expPolicy.update((p) => ({ ...p, [k]: v })); }

  taxRate(t: Tax): string { return `${t.rate}${t.included_in_price ? ' (incluido)' : ''}`; }
}
