import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LmsConnection, LmsService, LmsTestResult } from '../../../core/lms/lms.service';
import { IconComponent } from '../../../shared/icon.component';
import { ConfirmModalComponent, ToastService } from '../../../shared/ui';

const CAPABILITY_LABELS: Record<string, string> = {
  users_create: 'Crear usuarios',
  users_update: 'Actualizar usuarios',
  courses_create: 'Crear cursos',
  courses_update: 'Actualizar cursos',
  cohorts: 'Grupos y cohortes',
  enrol: 'Matrícula automática',
  grades_read: 'Leer calificaciones',
  grades_write: 'Escribir calificaciones',
  completion: 'Progreso de actividades',
  contents: 'Contenidos del curso',
};

const REQUIRED_FUNCTIONS = [
  'core_webservice_get_site_info',
  'core_user_create_users',
  'core_user_update_users',
  'core_user_get_users_by_field',
  'core_course_create_courses',
  'core_course_update_courses',
  'core_course_get_contents',
  'core_cohort_add_cohort_members',
  'enrol_manual_enrol_users',
  'gradereport_user_get_grade_items',
  'core_completion_get_course_completion_status',
];

const STATUS_LABELS: Record<string, string> = {
  unconfigured: 'Sin configurar',
  draft: 'Borrador sin activar',
  connected: 'Conectado',
  error: 'Con error',
};

@Component({
  selector: 'app-lms-integration',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ConfirmModalComponent],
  templateUrl: './integration.component.html',
  styleUrl: './integration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntegrationComponent implements OnInit {
  private readonly api = inject(LmsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = viewChild<ConfirmModalComponent>('confirm');

  readonly conn = signal<LmsConnection | null>(null);
  readonly test = signal<LmsTestResult | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly activating = signal(false);
  readonly activationError = signal<string | null>(null);
  readonly showGuide = signal(true);
  readonly copied = signal(false);

  form = {
    deployment_type: 'other',
    base_url: '',
    strategy: 'link_only',
    sync_enabled: false,
    sync_interval_minutes: 15,
    token: '',
  };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.settings().subscribe({
      next: (conn) => {
        this.conn.set(conn);
        this.applyForm(conn);
        this.loading.set(false);
      },
      error: (err) => {
        this.toast.error(err);
        this.loading.set(false);
      },
    });
  }

  private applyForm(conn: LmsConnection): void {
    const draft = conn.draft;
    this.form = {
      deployment_type: draft?.deployment_type ?? conn.deployment_type ?? 'other',
      base_url: draft?.base_url ?? conn.base_url ?? '',
      strategy: draft?.strategy ?? conn.strategy ?? 'link_only',
      sync_enabled: draft?.sync_enabled ?? conn.sync_enabled,
      sync_interval_minutes: draft?.sync_interval_minutes ?? conn.sync_interval_minutes,
      token: '',
    };
  }

  statusLabel(): string {
    const status = this.conn()?.status ?? 'unconfigured';
    return STATUS_LABELS[status] ?? status;
  }

  statusTone(): string {
    const status = this.conn()?.status ?? 'unconfigured';
    if (status === 'connected') return 'ok';
    if (status === 'error') return 'error';
    if (status === 'draft') return 'warn';
    return 'muted';
  }

  hasToken(): boolean {
    const conn = this.conn();
    return Boolean(
      this.form.token.trim() || conn?.draft?.token_set || conn?.token_set,
    );
  }

  tokenHint(): string | null {
    const conn = this.conn();
    return conn?.draft?.token_hint ?? conn?.token_hint ?? null;
  }

  canSubmit(): boolean {
    return Boolean(this.form.base_url.trim()) && this.hasToken();
  }

  capabilities(): Array<{ key: string; label: string; ok: boolean }> {
    const source = this.test()?.capabilities ?? this.conn()?.capabilities ?? {};
    return Object.keys(CAPABILITY_LABELS)
      .filter((key) => key in source)
      .map((key) => ({ key, label: CAPABILITY_LABELS[key], ok: Boolean(source[key]) }));
  }

  warnings(): string[] {
    const test = this.test();
    if (test) return test.warnings;
    return this.conn()?.capability_warnings ?? [];
  }

  guideSteps(): string[] {
    const base = [
      'En Moodle, entre como administrador del sitio.',
      'Active los servicios web: Administración del sitio → Características avanzadas → Servicios web.',
      'Habilite el protocolo REST: Administración del sitio → Plugins → Servicios web → Gestionar protocolos.',
      'Cree un usuario de servicio dedicado (por ejemplo, “Integración ECAP”) con un rol limitado a cursos, usuarios y matrículas.',
      'Cree un servicio externo y agréguele las funciones de la lista de abajo.',
      'Genere un token para ese usuario, restringido al servicio externo.',
      'Pegue aquí la URL raíz del sitio y el token, y pruebe la conexión.',
    ];
    if (this.form.deployment_type === 'moodlecloud') {
      base.push(
        'En MoodleCloud no se pueden instalar plugins: si el plan no expone matrícula o calificaciones, use el modo “solo enlace”.',
      );
    }
    return base;
  }

  functionsText(): string {
    return REQUIRED_FUNCTIONS.join('\n');
  }

  copyFunctions(): void {
    if (!navigator.clipboard?.writeText) {
      this.toast.warn('Copie la lista manualmente desde el recuadro.');
      return;
    }
    navigator.clipboard
      .writeText(this.functionsText())
      .then(() => this.markCopied())
      .catch(() => this.toast.warn('No se pudo copiar la lista.'));
  }

  private markCopied(): void {
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  saveDraft(): void {
    if (!this.form.base_url.trim()) {
      this.toast.warn('Ingrese la URL de Moodle.');
      return;
    }
    this.saving.set(true);
    this.activationError.set(null);
    this.api
      .save({ ...this.form, token: this.form.token.trim() || undefined })
      .subscribe({
        next: (conn) => {
          this.conn.set(conn);
          this.applyForm(conn);
          this.saving.set(false);
          this.toast.ok('Configuración guardada como borrador.');
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error(err);
        },
      });
  }

  testConnection(): void {
    if (!this.form.base_url.trim()) {
      this.toast.warn('Ingrese la URL de Moodle.');
      return;
    }
    this.testing.set(true);
    this.activationError.set(null);
    this.test.set(null);
    this.api
      .test({
        base_url: this.form.base_url.trim(),
        token: this.form.token.trim() || undefined,
      })
      .subscribe({
        next: (result) => {
          this.test.set(result);
          this.testing.set(false);
          if (result.ok) this.toast.ok(result.message);
          else this.toast.warn(result.message);
        },
        error: (err) => {
          this.testing.set(false);
          this.toast.error(err);
        },
      });
  }

  activate(): void {
    if (!this.canSubmit()) {
      this.toast.warn('Complete la URL y el token antes de activar.');
      return;
    }
    this.activating.set(true);
    this.activationError.set(null);
    this.api
      .save({ ...this.form, token: this.form.token.trim() || undefined })
      .subscribe({
        next: () => this.doActivate(),
        error: (err) => {
          this.activating.set(false);
          this.toast.error(err);
        },
      });
  }

  private doActivate(): void {
    this.api.activate().subscribe({
      next: (result) => {
        this.conn.set(result.connection);
        this.applyForm(result.connection);
        this.activating.set(false);
        if (result.ok) {
          this.test.set(null);
          this.toast.ok(result.message);
        } else {
          this.activationError.set(result.message);
          this.toast.warn(result.message);
        }
      },
      error: (err) => {
        this.activating.set(false);
        this.toast.error(err);
      },
    });
  }

  async disconnect(): Promise<void> {
    const accepted = await this.confirm()?.ask({
      title: 'Desconectar Moodle',
      message:
        'Se eliminará el token guardado y el CRM dejará de sincronizar con Moodle. Las aulas existentes no se modifican.',
      danger: true,
      confirmLabel: 'Desconectar',
    });
    if (!accepted) return;
    this.api.disconnect().subscribe({
      next: (conn) => {
        this.conn.set(conn);
        this.test.set(null);
        this.applyForm(conn);
        this.toast.ok('Conexión con Moodle eliminada.');
      },
      error: (err) => this.toast.error(err),
    });
  }
}
