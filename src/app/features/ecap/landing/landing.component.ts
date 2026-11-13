import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AcademicService } from '../../../core/academic/academic.service';
import { IconComponent } from '../../../shared/icon.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  encapsulation: ViewEncapsulation.Emulated,
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements OnInit {
  private readonly api = inject(AcademicService);
  readonly sections = signal<any[]>([]);
  readonly publications = signal<any[]>([]);
  readonly news = signal<any[]>([]);
  readonly loading = signal(true);
  readonly menuOpen = signal(false);
  readonly year = new Date().getFullYear();
  readonly tones = ['violet', 'sky', 'mint', 'coral', 'amber', 'pink'];

  private pending = 3;

  ngOnInit(): void {
    this.api.landingSections(true).subscribe({
      next: (d) => {
        this.sections.set(d);
        this.done();
      },
      error: () => this.done(),
    });
    this.api.publications(true).subscribe({
      next: (d) => {
        this.publications.set(d);
        this.done();
      },
      error: () => this.done(),
    });
    this.api.news(true).subscribe({
      next: (d) => {
        this.news.set(d);
        this.done();
      },
      error: () => this.done(),
    });
  }

  section(key: string): any {
    return this.sections().find((s) => s.key === key);
  }

  private done(): void {
    this.pending = Math.max(0, this.pending - 1);
    if (this.pending === 0) this.loading.set(false);
  }
}
