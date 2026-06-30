import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environments';
import { GuardarFiadosResponse } from '../interfaces/transcription';

@Injectable({ providedIn: 'root' })
export class FiadosApiService {
  private readonly http = inject(HttpClient);

  guardar(transcripcionId: string): Promise<GuardarFiadosResponse> {
    return firstValueFrom(
      this.http.post<GuardarFiadosResponse>(`${environment.apiUrl}fiados`, {
        transcripcion_id: transcripcionId,
      }),
    );
  }
}
