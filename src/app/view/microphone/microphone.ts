import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { ThemeService } from '../../core/services/theme.service';
import { AudioApiService } from '../../core/services/audio-api.service';
import { FiadosApiService } from '../../core/services/fiados-api.service';
import { TranscripcionesApiService } from '../../core/services/transcripciones-api.service';
import {
  FiadoItem,
  ProcesarFiadoResponse,
  TranscripcionSession,
} from '../../core/interfaces/transcription';
import { ButtonModule } from 'primeng/button';

const TRANSCRIPCION_ID_KEY = 'transcripcion_id';

interface FiadoRecord {
  id: number;
  name: string;
  initial: string;
  avatarColor: string;
  timeAgo: string;
  items: string;
  amount: number;
  status: string;
}

@Component({
  selector: 'app-microphone',
  standalone: true,
  imports: [DecimalPipe, TableModule, ButtonModule],
  templateUrl: './microphone.html',
  styleUrls: ['./microphone.scss'],
})
export default class MicrophoneComponent implements OnInit, OnDestroy {
  protected readonly theme = inject(ThemeService);
  private readonly audioApi = inject(AudioApiService);
  private readonly fiadosApi = inject(FiadosApiService);
  private readonly transcripcionesApi = inject(TranscripcionesApiService);

  protected readonly records: FiadoRecord[] = [
    {
      id: 1,
      name: 'Juan Pérez',
      initial: 'J',
      avatarColor: '#c8e6c9',
      timeAgo: 'Hace 5 min',
      items: 'Pan y Leche',
      amount: 15.0,
      status: 'PENDIENTE',
    },
    {
      id: 2,
      name: 'María López',
      initial: 'M',
      avatarColor: '#ffe0b2',
      timeAgo: 'Hace 12 min',
      items: 'Arroz y Aceite',
      amount: 28.5,
      status: 'PENDIENTE',
    },
    {
      id: 3,
      name: 'Carlos Ruiz',
      initial: 'C',
      avatarColor: '#a5d6a7',
      timeAgo: 'Hace 25 min',
      items: 'Gaseosa y Snacks',
      amount: 9.0,
      status: 'PENDIENTE',
    },
  ];

  protected readonly isRecording = signal(false);
  protected readonly hasPendingAudio = signal(false);
  protected readonly recordingSeconds = signal(0);
  protected readonly recordingError = signal<string | null>(null);
  protected readonly micHint = signal<string | null>(null);
  protected readonly session = signal<TranscripcionSession | null>(null);
  protected readonly isSaving = signal(false);
  protected readonly isGuardando = signal(false);
  protected readonly saveMessage = signal<string | null>(null);
  protected readonly rowRecordingIndex = signal<number | null>(null);
  protected readonly rowSavingIndex = signal<number | null>(null);

  protected readonly formattedTime = computed(() => {
    const total = this.recordingSeconds();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  });

  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];
  private pendingAudioBlob: Blob | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private recordingTarget: 'main' | number = 'main';
  private onRecordingComplete: ((blob: Blob) => void | Promise<void>) | null =
    null;

  async ngOnInit(): Promise<void> {
    if (!this.isMicrophoneSupported()) {
      this.micHint.set('Tu navegador no soporta grabación de audio.');
      return;
    }

    if (!window.isSecureContext) {
      this.micHint.set(
        'El micrófono requiere HTTPS. Usa npm run start:network desde el celular.',
      );
      return;
    }

    const storedId = sessionStorage.getItem(TRANSCRIPCION_ID_KEY);
    if (storedId) {
      await this.restoreSession(storedId);
    }
  }

  ngOnDestroy(): void {
    this.cancelRecording();
  }

  async onMicClick(): Promise<void> {
    if (this.isSaving() || this.rowSavingIndex() !== null || this.rowRecordingIndex() !== null) {
      return;
    }

    if (this.isRecording()) {
      this.finishRecording();
      return;
    }

    this.clearSession();
    this.pendingAudioBlob = null;
    this.hasPendingAudio.set(false);
    this.saveMessage.set(null);
    await this.startRecording('main', (blob) => {
      this.pendingAudioBlob = blob;
      this.hasPendingAudio.set(true);
    });
  }

  async onRowMicClick(index: number, item: FiadoItem): Promise<void> {
    if (!this.necesitaCorreccion(item)) return;

    if (this.isSaving() || this.rowSavingIndex() !== null || this.isRecording()) {
      return;
    }

    if (this.rowRecordingIndex() === index) {
      this.finishRecording();
      return;
    }

    if (this.rowRecordingIndex() !== null) return;

    await this.startRecording(index, async (blob) => {
      await this.sendRowCorrection(index, blob);
    });
  }

  protected isRowRecording(index: number): boolean {
    return this.rowRecordingIndex() === index;
  }

  protected isRowSaving(index: number): boolean {
    return this.rowSavingIndex() === index;
  }

  protected necesitaCorreccion(item: FiadoItem): boolean {
    return !item.se_encontro || !item.producto || item.monto <= 0;
  }

  async onSendClick(): Promise<void> {
    if (!this.pendingAudioBlob || this.isRecording() || this.isSaving()) return;
    await this.sendPendingAudio();
  }

  async onGuardarClick(): Promise<void> {
    const current = this.session();
    if (!current?.transcripcion_id || this.isGuardando() || this.isSaving()) {
      return;
    }

    if (this.rowRecordingIndex() !== null || this.rowSavingIndex() !== null) {
      return;
    }

    this.isGuardando.set(true);
    this.recordingError.set(null);
    this.saveMessage.set(null);

    try {
      const { guardados, pendientes, completado } = await this.fiadosApi.guardar(
        current.transcripcion_id,
      );

      if (completado) {
        this.clearSession();
        return;
      }

      this.session.set({ ...current, fiados: pendientes });
      this.saveMessage.set(
        `${guardados.length} guardado(s). Quedan ${pendientes.length} por corregir.`,
      );
    } catch (error) {
      this.recordingError.set(this.getApiErrorMessage(error));
    } finally {
      this.isGuardando.set(false);
    }
  }

  protected canGuardar(): boolean {
    return (
      !!this.session()?.transcripcion_id &&
      !this.isGuardando() &&
      !this.isSaving() &&
      this.rowRecordingIndex() === null &&
      this.rowSavingIndex() === null &&
      !this.isRecording()
    );
  }

  private isMicrophoneSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  private async restoreSession(id: string): Promise<void> {
    try {
      const detalle = await this.transcripcionesApi.getById(id);

      if (detalle.estado === 'confirmada' || detalle.estado === 'confirmado') {
        sessionStorage.removeItem(TRANSCRIPCION_ID_KEY);
        return;
      }

      this.session.set({
        transcripcion_id: detalle.transcripcion_id,
        transcripcion: detalle.text,
        fiados: detalle.fiados,
        nota: null,
        confianza_baja: [],
      });
    } catch {
      sessionStorage.removeItem(TRANSCRIPCION_ID_KEY);
    }
  }

  private persistTranscripcionId(id: string): void {
    sessionStorage.setItem(TRANSCRIPCION_ID_KEY, id);
  }

  private clearSession(): void {
    this.session.set(null);
    sessionStorage.removeItem(TRANSCRIPCION_ID_KEY);
  }

  private applyProcesarResponse(response: ProcesarFiadoResponse): void {
    this.persistTranscripcionId(response.transcripcion_id);
    this.session.set({
      transcripcion_id: response.transcripcion_id,
      transcripcion: response.transcripcion,
      fiados: response.fiado.fiados,
      nota: response.fiado.nota,
      confianza_baja: response.fiado.confianza_baja,
    });
  }

  private async startRecording(
    target: 'main' | number,
    onComplete: (blob: Blob) => void | Promise<void>,
  ): Promise<void> {
    this.recordingError.set(null);
    this.recordingTarget = target;
    this.onRecordingComplete = onComplete;

    if (target === 'main') {
      this.rowRecordingIndex.set(null);
    } else {
      this.rowRecordingIndex.set(target);
    }

    if (!this.isMicrophoneSupported()) {
      this.recordingError.set('Tu navegador no soporta grabación de audio.');
      return;
    }

    if (!window.isSecureContext) {
      this.recordingError.set(
        'Acceso bloqueado. El micrófono requiere HTTPS (npm run start:network).',
      );
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = this.getSupportedMimeType();

      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType })
        : new MediaRecorder(this.mediaStream);

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm',
        });

        const complete = this.onRecordingComplete;
        this.onRecordingComplete = null;
        this.rowRecordingIndex.set(null);

        if (audioBlob.size > 0 && complete) {
          void Promise.resolve(complete(audioBlob));
        }

        this.releaseMicrophone();
      };

      this.mediaRecorder.start();

      if (target === 'main') {
        this.isRecording.set(true);
      }

      this.recordingSeconds.set(0);

      this.timerInterval = setInterval(() => {
        this.recordingSeconds.update((seconds) => seconds + 1);
      }, 1000);
    } catch (error) {
      this.recordingError.set(this.getMicrophoneErrorMessage(error));
      this.rowRecordingIndex.set(null);
      this.onRecordingComplete = null;
      this.releaseMicrophone();
    }
  }

  private getSupportedMimeType(): string | undefined {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
    ];

    return types.find((type) => MediaRecorder.isTypeSupported(type));
  }

  private getMicrophoneErrorMessage(error: unknown): string {
    const name = error instanceof DOMException ? error.name : '';

    switch (name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Permiso denegado. En el celular: configuración del sitio → Micrófono → Permitir.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No se encontró micrófono en este dispositivo.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'El micrófono está en uso por otra app. Ciérrala e intenta de nuevo.';
      case 'SecurityError':
        return 'Acceso bloqueado. El micrófono requiere HTTPS (npm run start:network).';
      case 'AbortError':
        return 'La solicitud del micrófono fue cancelada. Intenta de nuevo.';
      default:
        return 'No se pudo acceder al micrófono. Revisa permisos en el navegador del celular.';
    }
  }

  private finishRecording(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    } else {
      this.releaseMicrophone();
    }

    if (this.recordingTarget === 'main') {
      this.isRecording.set(false);
    }
  }

  private cancelRecording(): void {
    this.pendingAudioBlob = null;
    this.hasPendingAudio.set(false);
    this.onRecordingComplete = null;
    this.rowRecordingIndex.set(null);
    this.finishRecording();
  }

  private async sendRowCorrection(index: number, audioBlob: Blob): Promise<void> {
    const current = this.session();
    if (!current?.transcripcion_id) return;

    this.rowSavingIndex.set(index);
    this.recordingError.set(null);

    try {
      const corrected = await this.audioApi.corregirFila(
        audioBlob,
        current.transcripcion_id,
        index,
      );

      this.persistTranscripcionId(corrected.transcripcion_id);
      this.session.set({
        ...current,
        transcripcion_id: corrected.transcripcion_id,
        fiados: corrected.fiados,
      });
    } catch (error) {
      this.recordingError.set(this.getApiErrorMessage(error));
    } finally {
      this.rowSavingIndex.set(null);
    }
  }

  private async sendPendingAudio(): Promise<void> {
    const audioBlob = this.pendingAudioBlob;
    if (!audioBlob || audioBlob.size === 0) return;

    this.isSaving.set(true);
    this.recordingError.set(null);
    this.saveMessage.set(null);

    try {
      const result = await this.audioApi.send(audioBlob);
      this.applyProcesarResponse(result);
      this.pendingAudioBlob = null;
      this.hasPendingAudio.set(false);
    } catch (error) {
      this.recordingError.set(this.getApiErrorMessage(error));
    } finally {
      this.isSaving.set(false);
    }
  }

  private getApiErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'No se pudo enviar el audio a la API.';
    }

    if (error.status === 0) {
      return 'No se pudo conectar al backend. Verifica que esté corriendo en la PC y que uses npm run start:network desde el celular.';
    }

    const message = error.error?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(', ');

    return `Error ${error.status}: no se pudo enviar el audio.`;
  }

  private releaseMicrophone(): void {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}
