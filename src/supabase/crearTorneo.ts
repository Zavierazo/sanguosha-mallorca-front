import { getSupabase } from "./client";
import type { PlayerScore } from "../Ranking/Ranking";

/** Una fila de puntuaciones, tal cual las espera crear_torneo(). */
export interface FilaPuntuacion {
  num_partida: number;
  jugador: string;
  rol: string;
  puntos: number;
  ganada: boolean;
}

export interface CrearTorneoPayload {
  /** null crea un torneo nuevo; un id continúa uno existente. */
  torneo_id: number | null;
  descripcion: string;
  fecha: string;
  scoring_system: string;
  nivel: number;
  is_ranked: boolean;
  filas: FilaPuntuacion[];
}

/** Lo que devuelve crear_torneo(): el equivalente a los SELECT finales del script. */
export interface CrearTorneoResultado {
  torneo_id: number;
  torneo_creado: boolean;
  descripcion: string | null;
  fecha: string;
  nivel: number;
  is_ranked: boolean;
  scoring_system: string;
  partidas: number[];
  puntuaciones_insertadas: number;
  jugadores_actualizados: number;
  jugadores_creados: string[];
}

/**
 * Convierte la matriz ronda x jugador del componente en las filas del payload.
 *
 * El emparejamiento nombre-puntuación se hace ANTES de filtrar. Si se filtra
 * primero, el índice que llega al map es el del array ya filtrado y los nombres
 * se desplazan: en un torneo continuado, donde las filas importadas del Google
 * Sheet se descartan, los puntos acabarían asignados al jugador equivocado.
 */
export function buildFilas(
  playerScores: PlayerScore[][],
  players: string[]
): FilaPuntuacion[] {
  return playerScores.flatMap((round, roundIndex) =>
    (round ?? [])
      .map((score, playerIndex) => ({ score, jugador: players[playerIndex] }))
      .filter(
        ({ score, jugador }) =>
          Boolean(jugador) &&
          score != null &&
          score.role !== null &&
          !score.imported
      )
      .map(({ score, jugador }) => ({
        num_partida: roundIndex + 1,
        jugador,
        rol: score.role as string,
        puntos: score.score,
        ganada: Boolean(score.winner),
      }))
  );
}

/**
 * Qué nombres del lote no están en la tabla de jugadores.
 *
 * El selector de la página permite teclear nombres nuevos, así que una errata
 * ("Miqel") crearía un jugador y sus puntos desaparecerían del ranking real.
 * crear_torneo() se niega en ese caso, pero conviene avisar antes de que el
 * usuario le dé al botón.
 *
 * La comparación ignora mayúsculas porque la columna es citext: en la base de
 * datos 'AliG' y 'Alig' son el mismo jugador, y aquí tiene que serlo también.
 */
export async function jugadoresDesconocidos(
  nombres: string[]
): Promise<string[]> {
  const buscados = Array.from(
    new Map(
      nombres
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((n) => [n.toLocaleLowerCase(), n])
    ).values()
  );

  if (buscados.length === 0) return [];

  const { data, error } = await getSupabase()
    .from("v_jugadores")
    .select("nombre");

  if (error) throw new Error(error.message);

  const conocidos = new Set(
    (data ?? [])
      .map((row) => row.nombre)
      .filter((n): n is string => Boolean(n))
      .map((n) => n.trim().toLocaleLowerCase())
  );

  return buscados.filter((n) => !conocidos.has(n.toLocaleLowerCase()));
}

/**
 * Da de alta la sesión de juego. Una llamada, una transacción.
 *
 * Todo lo que el script de SSMS hacía entre BEGIN y COMMIT pasa dentro de la
 * función de PostgreSQL: si cualquier paso falla, no queda nada a medias.
 */
export async function crearTorneo(
  payload: CrearTorneoPayload,
  crearJugadores = false
): Promise<CrearTorneoResultado> {
  const { data, error } = await getSupabase().rpc("crear_torneo", {
    p_payload: payload as unknown as never,
    p_crear_jugadores: crearJugadores,
  });

  if (error) {
    // Los mensajes de las excepciones de crear_torneo() ya están redactados
    // para leerse tal cual; details/hint sólo aparecen en fallos inesperados.
    const extra = [error.details, error.hint].filter(Boolean).join(" ");
    throw new Error(extra ? `${error.message} ${extra}` : error.message);
  }

  return data as unknown as CrearTorneoResultado;
}
