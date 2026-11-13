import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { V1InventoryService, ExpiringLot } from '../../../core/v1/inventory.service';
import { ToastService } from '../../../shared/ui';

@Component({
  selector: 'app-expiring',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './expiring.component.html',
  styleUrl: './expiring.component.scss',
})
export class ExpiringComponent implements OnInit {
  private readonly inv = inject(V1InventoryService);
  private readonly toast = inject(ToastService);
  readonly items = signal<ExpiringLot[]>([]);
  readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.inv.expiringLots().subscribe({
      next: (r) => this.items.set(r),
      error: (err) => {
        this.loading.set(false);
        this.toast.error(err);
      },
      complete: () => this.loading.set(false),
    });
  }
}
