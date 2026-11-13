import { AfterViewInit, Component, EventEmitter, Input, OnDestroy, Output, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scanner.component.html',
  styleUrl: './scanner.component.scss'
})
export class BarcodeScannerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  @Input() formats: BarcodeFormat[] = [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
  ];
  @Output() scanned = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  readonly error = signal<string | null>(null);
  private reader: BrowserMultiFormatReader | null = null;
  private controls: { stop: () => void } | null = null;

  async start(): Promise<void> {
    this.error.set(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('Este navegador no soporta acceso a cámara');
      return;
    }

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, this.formats);
    this.reader = new BrowserMultiFormatReader(hints);

    try {
      this.controls = await this.reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        this.videoRef.nativeElement,
        (result) => {
          if (!result) return;
          const text = result.getText();
          if (text) {
            this.scanned.emit(text);
            this.stop();
          }
        }
      );
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        this.error.set('Permiso de cámara denegado');
      } else if (err?.name === 'NotFoundError') {
        this.error.set('No se encontró cámara');
      } else {
        this.error.set('No se pudo iniciar el escáner');
      }
    }
  }

  ngAfterViewInit(): void {
    void this.start();
  }

  stop(): void {
    this.controls?.stop();
    this.controls = null;
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.controls?.stop();
    this.controls = null;
  }
}
