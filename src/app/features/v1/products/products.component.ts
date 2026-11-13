import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { V1CatalogService, Product } from '../../../core/v1/catalog.service';
import { ToastService } from '../../../shared/ui';
import { SessionService } from '../../../core/v1/session.service';
import { BarcodeScannerComponent } from '../../../shared/ui/scanner/scanner.component';

interface ProductForm {
  sku: string; name: string; product_type: string; stock_unit_id: string; sale_price: string;
  purchase_cost: string; min_stock: string; track_lots: boolean; track_expiry: boolean; barcode: string;
}

@Component({
  selector: 'app-v1-products',
  standalone: true,
  imports: [CommonModule, FormsModule, BarcodeScannerComponent],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
})
export class ProductsComponent implements OnInit {
  private readonly catalog = inject(V1CatalogService);
  private readonly toast = inject(ToastService);
  readonly session = inject(SessionService);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly canWrite = computed(() => this.session.can('catalogo.productos.crear'));
  readonly canEdit = computed(() => this.session.can('catalogo.productos.editar'));

  // formulario de alta (reactivo simplificado con signals)
  readonly form = signal<ProductForm>({
    sku: '', name: '', product_type: 'finished', stock_unit_id: '', sale_price: '0',
    purchase_cost: '0', min_stock: '', track_lots: false, track_expiry: false, barcode: '',
  });
  readonly units = signal<{ id: string; code: string; name: string }[]>([]);
  readonly showForm = signal(false);
  readonly saving = signal(false);
  readonly scannerOpen = signal(false);

  ngOnInit(): void {
    this.load();
    this.catalog.units().subscribe({ next: (u) => this.units.set(u.map((x) => ({ id: x.id, code: x.code, name: x.name }))), error: () => {} });
  }

  load(): void {
    this.loading.set(true);
    const q = this.search().trim();
    this.catalog.products(q ? { q } : {}).subscribe({
      next: (list) => { this.products.set(list); this.loading.set(false); },
      error: (err) => { this.toast.error(err); this.loading.set(false); },
    });
  }

  onSearch(v: string): void {
    this.search.set(v);
    this.load();
  }

  set(k: keyof ProductForm, v: string | boolean): void {
    this.form.update((f) => ({ ...f, [k]: v }));
  }

  openScanner(): void { this.scannerOpen.set(true); }
  onScanned(code: string): void { this.form.update((f) => ({ ...f, barcode: code, sku: f.sku || code })); this.scannerOpen.set(false); }
  closeScanner(): void { this.scannerOpen.set(false); }

  save(): void {
    const f = this.form();
    if (!f.sku.trim() || !f.name.trim()) {
      this.toast.warn('SKU y nombre son obligatorios');
      return;
    }
    this.saving.set(true);
    const payload: Record<string, unknown> = {
      sku: f.sku.trim(), name: f.name.trim(), product_type: f.product_type,
      sale_price: f.sale_price || '0', purchase_cost: f.purchase_cost || '0',
      track_lots: f.track_lots, track_expiry: f.track_expiry,
    };
    if (f.stock_unit_id) payload['stock_unit_id'] = f.stock_unit_id;
    if (f.barcode.trim()) payload['barcode'] = f.barcode.trim();
    if (f.min_stock) payload['min_stock'] = f.min_stock;
    this.catalog.createProduct(payload as never).subscribe({
      next: (p) => {
        this.saving.set(false);
        this.showForm.set(false);
        this.toast.ok(`Producto ${p.sku} creado`);
        this.form.set({ sku: '', name: '', product_type: 'finished', stock_unit_id: '', sale_price: '0', purchase_cost: '0', min_stock: '', track_lots: false, track_expiry: false, barcode: '' });
        this.load();
      },
      error: (err) => { this.saving.set(false); this.toast.error(err); },
    });
  }

  toggleActive(p: Product): void {
    this.catalog.updateProduct(p.id, { active: !p.active }).subscribe({
      next: () => { this.toast.ok(p.active ? 'Producto desactivado' : 'Producto activado'); this.load(); },
      error: (err) => this.toast.error(err),
    });
  }

  typeLabel(t: string): string {
    return { finished: 'Terminado', raw: 'Materia prima', service: 'Servicio', package: 'Empaque', kit: 'Kit' }[t] ?? t;
  }
}
