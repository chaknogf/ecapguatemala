import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ManualSection {
  id: string;
  title: string;
  group: string;
}

/** Índice del manual de uso. Los ids son estables: se usan en los enlaces internos. */
export const MANUAL_SECTIONS: ManualSection[] = [
  { id: 'ingreso', title: 'Ingresar al sistema', group: 'Primeros pasos' },
  { id: 'clave', title: 'Cambiar contraseña', group: 'Primeros pasos' },
  { id: 'interfaz', title: 'Partes de la pantalla', group: 'Primeros pasos' },
  { id: 'permisos', title: 'Permisos y roles', group: 'Primeros pasos' },
  { id: 'panel', title: 'Panel', group: 'Operación diaria' },
  { id: 'catalogo', title: 'Catálogo de productos', group: 'Operación diaria' },
  { id: 'escaner', title: 'Escanear código de barras', group: 'Operación diaria' },
  { id: 'inventario', title: 'Inventario', group: 'Operación diaria' },
  { id: 'movimientos', title: 'Movimientos', group: 'Operación diaria' },
  { id: 'minimo', title: 'Por debajo del mínimo', group: 'Alertas' },
  { id: 'vencer', title: 'Prontos a vencer', group: 'Alertas' },
  { id: 'compras', title: 'Compras', group: 'Compras y ventas' },
  { id: 'ventas', title: 'Ventas', group: 'Compras y ventas' },
  { id: 'clientes', title: 'Clientes', group: 'Compras y ventas' },
  { id: 'usuarios', title: 'Usuarios y roles', group: 'Administración' },
  { id: 'configuracion', title: 'Configuración', group: 'Administración' },
  { id: 'auditoria', title: 'Auditoría', group: 'Administración' },
  { id: 'estados', title: 'Estados y colores', group: 'Referencia' },
  { id: 'errores', title: 'Mensajes y solución de problemas', group: 'Referencia' },
  { id: 'glosario', title: 'Glosario', group: 'Referencia' },
  { id: 'limites', title: 'Limitaciones conocidas', group: 'Referencia' },
];

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

@Component({
  selector: 'app-v1-manual',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manual.component.html',
  styleUrl: './manual.component.scss',
})
export class ManualComponent {
  @ViewChild('root', { static: true }) private root!: ElementRef<HTMLElement>;

  readonly sections = MANUAL_SECTIONS;
  readonly groups = [...new Set(MANUAL_SECTIONS.map((s) => s.group))];
  readonly query = signal('');
  readonly noResults = signal(false);
  readonly tocOpen = signal(false);

  sectionsIn(group: string): ManualSection[] {
    return this.sections.filter((s) => s.group === group);
  }

  onSearch(value: string): void {
    this.query.set(value);
    const q = normalize(value.trim());
    const host = this.root.nativeElement;
    let visible = 0;

    host.querySelectorAll<HTMLElement>('article[data-section]').forEach((article) => {
      const match = !q || normalize(article.textContent ?? '').includes(q);
      article.hidden = !match;
      if (match) visible++;
    });
    host.querySelectorAll<HTMLElement>('[data-toc]').forEach((link) => {
      const target = host.querySelector<HTMLElement>(`#${CSS.escape(link.dataset['toc'] ?? '')}`);
      link.hidden = !!target?.hidden;
    });
    this.noResults.set(!!q && visible === 0);
  }

  clearSearch(input: HTMLInputElement): void {
    input.value = '';
    this.onSearch('');
  }

  go(event: Event, id: string): void {
    event.preventDefault();
    const el = this.root.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el?.focus({ preventScroll: true });
  }

  top(): void {
    this.root.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
