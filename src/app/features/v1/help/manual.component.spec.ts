import { TestBed } from '@angular/core/testing';
import { ManualComponent, MANUAL_SECTIONS } from './manual.component';

describe('ManualComponent (manual de uso)', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<ManualComponent>>;
  let comp: ManualComponent;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ManualComponent] }).compileComponents();
    fixture = TestBed.createComponent(ManualComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  const visibleArticles = () =>
    Array.from(host.querySelectorAll<HTMLElement>('article[data-section]')).filter((a) => !a.hidden).map((a) => a.id);

  it('renderiza una sección por cada entrada del índice', () => {
    const ids = Array.from(host.querySelectorAll('article[data-section]')).map((a) => a.id);
    expect(ids.sort()).toEqual(MANUAL_SECTIONS.map((s) => s.id).sort());
  });

  it('cada enlace del índice apunta a una sección existente', () => {
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('[data-toc]'));
    expect(links.length).toBe(MANUAL_SECTIONS.length);
    for (const link of links) {
      const id = link.dataset['toc'] ?? '';
      expect(host.querySelector(`#${CSS.escape(id)}`)).not.toBeNull();
    }
  });

  it('la búsqueda filtra por texto y no distingue acentos ni mayúsculas', () => {
    const input = host.querySelector<HTMLInputElement>('#manual-q')!;
    input.value = 'CONTADO';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(visibleArticles()).toContain('ventas');
    expect(visibleArticles()).not.toContain('auditoria');
    expect(comp.noResults()).toBe(false);
  });

  it('muestra el estado sin resultados cuando nada coincide', () => {
    comp.onSearch('zzzz-no-existe');
    fixture.detectChanges();

    expect(visibleArticles()).toEqual([]);
    expect(comp.noResults()).toBe(true);
    expect(host.querySelector('.no-results')?.textContent).toContain('zzzz-no-existe');
  });

  it('limpiar la búsqueda vuelve a mostrar todas las secciones', () => {
    comp.onSearch('lote');
    comp.onSearch('');
    fixture.detectChanges();

    expect(visibleArticles().length).toBe(MANUAL_SECTIONS.length);
    expect(comp.noResults()).toBe(false);
  });

  it('oculta del índice las secciones que la búsqueda deja fuera', () => {
    comp.onSearch('glosario');
    fixture.detectChanges();

    const visibleLinks = Array.from(host.querySelectorAll<HTMLAnchorElement>('[data-toc]')).filter((a) => !a.hidden);
    expect(visibleLinks.map((a) => a.dataset['toc'])).toEqual(['glosario']);
  });

  it('no contiene instrucciones de instalación ni términos técnicos de despliegue', () => {
    const text = (host.textContent ?? '').toLowerCase();
    for (const forbidden of ['npm ', 'pnpm', 'python -m', '.env', 'uvicorn', 'alembic', 'jwt', 'docker', 'podman']) {
      expect(text).not.toContain(forbidden);
    }
  });
});
