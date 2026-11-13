import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { V1SalesService, Customer } from '../../../core/v1/sales.service';
import { ToastService } from '../../../shared/ui';
import { SessionService } from '../../../core/v1/session.service';

interface CustomerForm {
  code: string; name: string; party_type: string; tax_id: string; email: string; phone: string;
  credit_limit: string; max_discount_pct: string; payment_terms_days: string;
}

@Component({
  selector: 'app-v1-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customers.component.html',
  styleUrl: './customers.component.scss',
})
export class CustomersComponent implements OnInit {
  private readonly sales = inject(V1SalesService);
  private readonly toast = inject(ToastService);
  readonly session = inject(SessionService);

  readonly items = signal<Customer[]>([]);
  readonly search = signal('');
  readonly loading = signal(true);
  readonly showForm = signal(false);
  readonly saving = signal(false);

  form = signal<CustomerForm>({ code: '', name: '', party_type: 'individual', tax_id: '', email: '', phone: '', credit_limit: '', max_discount_pct: '0', payment_terms_days: '0' });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.sales.customers(this.search().trim() || undefined).subscribe({
      next: (c) => { this.items.set(c); this.loading.set(false); },
      error: (err) => { this.toast.error(err); this.loading.set(false); },
    });
  }

  onSearch(v: string): void { this.search.set(v); this.load(); }

  set(k: keyof CustomerForm, v: string): void { this.form.update((f) => ({ ...f, [k]: v })); }

  save(): void {
    const f = this.form();
    if (!f.code.trim() || !f.name.trim()) { this.toast.warn('Código y nombre son obligatorios'); return; }
    this.saving.set(true);
    this.sales.createCustomer({
      code: f.code.trim(), name: f.name.trim(),
      party_type: f.party_type as 'individual' | 'company',
      tax_id: f.tax_id || null, email: f.email || null, phone: f.phone || null,
      credit_limit: f.credit_limit || null,
      max_discount_pct: f.max_discount_pct || '0',
      payment_terms_days: Number(f.payment_terms_days || 0),
    }).subscribe({
      next: () => {
        this.saving.set(false); this.showForm.set(false);
        this.toast.ok('Cliente creado');
        this.form.set({ code: '', name: '', party_type: 'individual', tax_id: '', email: '', phone: '', credit_limit: '', max_discount_pct: '0', payment_terms_days: '0' });
        this.load();
      },
      error: (err) => { this.saving.set(false); this.toast.error(err); },
    });
  }

  typeLabel(t: string): string { return t === 'company' ? 'Empresa' : 'Individual'; }

  canWrite(): boolean { return this.session.can('clientes.*'); }
}
