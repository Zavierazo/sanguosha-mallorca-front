/**
 * Contrato de lectura de datos, independiente de dónde vengan.
 *
 * La web nació leyendo una hoja de Google. La hoja no era la fuente de la
 * verdad: era una copia periódica de la base de datos, necesaria sólo porque el
 * servidor de Azure estaba apagado la mayor parte del tiempo. Con los datos ya
 * en Supabase la copia deja de tener sentido, pero apagar la hoja de golpe
 * dejaría la web sin red de seguridad.
 *
 * De ahí este módulo: dos implementaciones del mismo contrato, una eligible en
 * caliente y con vuelta atrás automática. Ver ./index.ts.
 *
 * Los tipos describen lo que la web necesita, no lo que cada fuente ofrece. Es
 * lo que permite que la implementación de Supabase agregue en el servidor y la
 * de Google Sheets lo haga en el navegador, sin que Ranking.tsx note nada.
 */

export type DataSourceId = "sheets" | "supabase";

/** Un jugador y la última vez que jugó. Alimenta el selector de jugadores. */
export interface PlayerActivity {
  nombre: string;
  /**
   * `YYYY-MM-DD`, o null si no consta. Null cuenta como jugador activo: es el
   * comportamiento que tenía la web con la hoja, donde una fila sin fecha se
   * colaba en el filtro de meses. Hoy no hay ninguna fila así (0 de 11.465),
   * pero cambiarlo sería un cambio de comportamiento no pedido.
   */
  ultimaPartida: string | null;
}

/** Nivel efectivo de un jugador, para autoseleccionar el nivel de la partida. */
export interface PlayerLevel {
  nombre: string;
  /**
   * `max_nivel_jugado`: la columna F de la pestaña `Exp`, que es la que la web
   * venía usando. Null cuando el jugador no tiene nivel asignado todavía.
   *
   * Con la hoja este valor llegaba como la cadena "NULL" y acababa convertido
   * en NaN, que contaminaba el Math.min del nivel de partida y dejaba el
   * desplegable en blanco. Aquí es null y se descarta, en las dos fuentes.
   */
  nivel: number | null;
}

/** Resumen de un torneo. La web avisa si los jugadores ya han jugado juntos. */
export interface TournamentSummary {
  /** Se maneja como cadena porque es la clave con la que compara la web. */
  torneoId: string;
  /** Alfabético, para comparar conjuntos de jugadores. */
  jugadores: string[];
  /** Orden de primera aparición, que es el orden de asiento en la mesa. */
  jugadoresOrdenOriginal: string[];
  maxNumPartida: number;
  numJugadores: number;
  isCompleted: boolean;
  /** `YYYY-MM-DD` del sistema de puntuación vigente, o null. */
  scoringSystem: string | null;
}

/** Una celda de la tabla de un torneo ya jugado. */
export interface RoundEntry {
  role: string;
  score: number;
  winner: boolean;
}

/** numPartida -> jugador -> resultado. La forma que ya consumía Ranking.tsx. */
export type TournamentRounds = Map<number, Map<string, RoundEntry>>;

export interface DataSource {
  readonly id: DataSourceId;
  fetchPlayerActivity(): Promise<PlayerActivity[]>;
  fetchPlayerLevels(): Promise<PlayerLevel[]>;
  fetchTournaments(): Promise<TournamentSummary[]>;
  fetchTournamentRounds(torneoId: string): Promise<TournamentRounds>;
}
