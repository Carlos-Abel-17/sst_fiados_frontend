import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environments';
import {
  CorregirFilaResponse,
  ProcesarFiadoResponse,
} from '../interfaces/transcription';

@Injectable({ providedIn: 'root' })
export class AudioApiService {
  private readonly http = inject(HttpClient);

  send(blob: Blob): Promise<ProcesarFiadoResponse> {
    return firstValueFrom(
      this.http.post<ProcesarFiadoResponse>(
        `${environment.apiUrl}audio/fiado`,
        this.buildAudioFormData(blob, 'grabacion'),
      ),
    );
  }

  corregirFila(
    blob: Blob,
    transcripcionId: string,
    indice: number,
  ): Promise<CorregirFilaResponse> {
    const formData = this.buildAudioFormData(blob, 'correccion');
    formData.append('transcripcion_id', transcripcionId);
    formData.append('indice', String(indice));

    return firstValueFrom(
      this.http.post<CorregirFilaResponse>(
        `${environment.apiUrl}audio/corregir-fila`,
        formData,
      ),
    );
  }

  private buildAudioFormData(blob: Blob, prefix: 'grabacion' | 'correccion'): FormData {
    const formData = new FormData();
    formData.append('audio', blob, this.buildFilename(blob.type, prefix));
    return formData;
  }

  private buildFilename(mimeType: string, prefix: 'grabacion' | 'correccion'): string {
    const mimeBase = mimeType.split(';')[0];
    const extensions: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/mp3': 'mp3',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/m4a': 'm4a',
      'audio/mp4': 'mp4',
    };

    const extension = extensions[mimeBase] ?? 'webm';
    return `${prefix}.${extension}`;
  }
}
