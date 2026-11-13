import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { V1InventoryService, StockView } from '../../../core/v1/inventory.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-low-stock',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './low-stock.component.html',
  styleUrl: './low-stock.component.scss',
})
export class LowStockComponent implements OnInit {
  private readonly inv = inject(V1InventoryService);
  private readonly toast = inject(ToastService);
  readonly items = signal<StockView[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.inv.stock({ only_low: true }).subscribe({
      next: (r) => this.items.set(r),
      error: (err) => {
        this.loading.set(false);
        this.toast.error(err);
      },
      complete: () => this.loading.set(false),
    });
  }
}
