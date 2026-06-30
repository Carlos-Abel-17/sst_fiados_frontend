import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environments';
import { TranscripcionDetalle } from '../interfaces/transcription';

@Injectable({ providedIn: 'root' })
export class TranscripcionesApiService {
  private readonly http = inject(HttpClient);

  getById(id: string): Promise<TranscripcionDetalle> {
    return firstValueFrom(
      this.http.get<TranscripcionDetalle>(
        `${environment.apiUrl}transcripciones/${id}`,
      ),
    );
  }
}
