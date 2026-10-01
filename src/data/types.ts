/**
 * Contrato de lectura de datos.
 *
 * La web nació leyendo una hoja de Google. La hoja no era la fuente de la
 * verdad: era una copia periódica de la base de datos, necesaria sólo porque el
 * servidor de Azure estaba apagado la mayor parte del tiempo. Con los datos en
 * Supabase la copia dejó de tener sentido y se retiró: llevaba tiempo sin
 * actualizarse y una vuelta atrás a datos viejos es peor que un error honesto.
 * Si Supabase no responde, la web lo dice y ofrece reintentar. Ver ./index.ts.
 *
 * Queda el contrato, ya sin segunda implementación, porque sigue describiendo lo
 * que la web necesita en sus propios términos y no en los de la base de datos:
 * es lo que mantiene los detalles de PostgREST (paginación, nombres de columna,
 * nulos) dentro de ./supabaseSource.ts y fuera de Ranking.tsx.
 */

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
   * `max_nivel_jugado`: el nivel más alto que el jugador ha jugado en mesa (o el
   * asignado a mano en `jugadores.nivel`, que tiene preferencia). Es el número
   * que propone el desplegable de nivel. Null cuando no tiene nivel todavía.
   */
  nivel: number | null;
  /**
   * `nivel_desbloqueado`: el nivel más alto cuyo umbral de experiencia ya ha
   * superado el jugador, con independencia de lo que haya jugado.
   *
   * Sólo se usa para avisar de que un jugador está "al 100 %", que es
   * exactamente `nivel_desbloqueado > max_nivel_jugado`, la misma condición que
   * `v_nivel_jugadores.completo` (ver BD/migration/pg/09_v_nivel_jugadores.sql).
   * No es `porcentaje >= 100`: ese llega a 100 por redondeo sin serlo.
   *
   * Null significa que no ha desbloqueado ningún nivel todavía.
   */
  nivelDesbloqueado: number | null;
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

/**
 * Una entrada del catálogo de personajes (`public.personajes`).
 *
 * El mismo nombre puede aparecer en varios niveles (Sūn Quán está en cinco), así
 * que el nombre NO identifica una fila. Lo que se guarda en
 * `puntuaciones.personaje` es sólo el nombre. Ver BD/migration/pg/18_personajes.sql.
 */
export interface Personaje {
  nombre: string;
  /** Entero de 1 a 15, o 6.5. */
  nivel: number;
}

export interface DataSource {
  fetchPlayerActivity(): Promise<PlayerActivity[]>;
  /**
   * El catálogo completo, unas 1500 filas. Ranking.tsx lo pide aparte de las
   * otras tres lecturas: si falla, el campo de personaje se queda sin
   * sugerencias pero el resto de la pantalla sigue funcionando.
   */
  fetchPersonajes(): Promise<Personaje[]>;
  fetchPlayerLevels(): Promise<PlayerLevel[]>;
  fetchTournaments(): Promise<TournamentSummary[]>;
  fetchTournamentRounds(torneoId: string): Promise<TournamentRounds>;
}
