export interface FiadoItem {
  cliente: string;
  monto: number;
  producto: string | null;
  fecha: string; // YYYY-MM-DD
  se_encontro: boolean;
  cliente_id: string | null;
}

export interface FiadoExtraido {
  fiados: FiadoItem[];
  confianza_baja: string[];
  nota: string | null;
}

export interface ProcesarFiadoResponse {
  transcripcion_id: string;
  transcripcion: string;
  fiado: FiadoExtraido;
}

export interface CorregirFilaResponse {
  transcripcion_id: string;
  transcripcion: string;
  indice: number;
  fila: FiadoItem;
  fiados: FiadoItem[];
}

export interface GuardarFiadosResponse {
  transcripcion_id: string;
  guardados: FiadoItem[];
  pendientes: FiadoItem[];
  completado: boolean;
}

export interface TranscripcionDetalle {
  transcripcion_id: string;
  text: string;
  estado: string;
  fiados: FiadoItem[];
  correcciones: unknown[];
  fiados_guardados: unknown[];
}

export interface TranscripcionSession {
  transcripcion_id: string;
  transcripcion: string;
  fiados: FiadoItem[];
  nota: string | null;
  confianza_baja: string[];
}
