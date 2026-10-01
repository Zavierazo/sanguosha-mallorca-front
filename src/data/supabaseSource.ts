/**
 * Implementación sobre Supabase.
 *
 * Las consultas van contra vistas que agregan en el servidor, no contra las
 * 11.465 filas de `v_games`. El motivo no es sólo el ancho de banda:
 *
 *   PostgREST corta las respuestas en 1000 filas y NO da error. Devuelve 206
 *   con `Content-Range: 0-999/11465` y se queda tan ancho. Un `select *` sobre
 *   `v_games` daría datos incompletos en silencio, que es la peor forma de
 *   fallar: el ranking saldría mal y nadie vería una traza.
 *
 * Las vistas dejan cada consulta en 174 o 934 filas (ver
 * BD\migration\pg\09_vistas_web.sql). Aun así se pagina, porque 934 torneos
 * crecen con cada partida y algún día pasarán de 1000. El día que pase, esto ya
 * está resuelto.
 */

import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import type {
  DataSource,
  Personaje,
  PlayerActivity,
  PlayerLevel,
  RoundEntry,
  TournamentRounds,
  TournamentSummary,
} from "./types";

/** Tamaño de página. Coincide con el `db-max-rows` de Supabase. */
const PAGE_SIZE = 1000;

/**
 * Tope de tiempo por operación, contando todas sus páginas.
 *
 * Existe porque supabase-js no trae ninguno: una petición que no llega a
 * responder deja la promesa colgada para siempre, y la pantalla se queda en
 * "Actualizando…" sin error y sin ofrecer reintentar. Eso es justo el fallo que
 * hay que hacer visible. Diez segundos es holgado para consultas que tardan
 * cientos de milisegundos, y corto para una sesión de juego esperando.
 */
const TIMEOUT_MS = 10_000;

/**
 * Se agotó el tope de tiempo.
 *
 * Tiene tipo propio para que la capa de reintentos pueda no reintentarlo: si la
 * base de datos no ha contestado en diez segundos, no es un corte pasajero, y
 * volver a esperar otros diez sólo retrasa el aviso. Ver ./index.ts.
 */
export class TimeoutLecturaError extends Error {
  constructor() {
    super(`La base de datos no ha respondido en ${TIMEOUT_MS / 1000} s.`);
    this.name = "TimeoutLecturaError";
  }
}

/**
 * Recorre una consulta por páginas hasta agotarla, con tope de tiempo.
 *
 * `build` recibe el rango y la señal, y devuelve la consulta ya acotada. Se le
 * pasa el rango en lugar de aplicarlo aquí porque los tipos de
 * PostgrestFilterBuilder no permiten reutilizar una consulta ya construida.
 *
 * La señal es una sola para toda la operación, no una por página: lo que se
 * quiere acotar es lo que tarda la lectura completa.
 *
 * Al abortar, postgrest-js no lanza: convierte el fallo en `error` (lo hace en
 * su `then`, mientras `shouldThrowOnError` sea false, que es el defecto). Y el
 * aborto se reconoce por `signal.aborted`, no por el nombre del error, porque
 * `AbortSignal.timeout` produce un `TimeoutError` y no un `AbortError`: mirar el
 * nombre fallaría en silencio.
 */
export async function fetchAllPages<T>(
  build: (
    from: number,
    to: number,
    signal: AbortSignal
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1, signal);
    if (error) {
      if (signal.aborted) throw new TimeoutLecturaError();
      throw new Error(error.message);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    // Una página incompleta significa que era la última.
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

export function createSupabaseSource(): DataSource {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase no está configurado: faltan VITE_SUPABASE_URL o " +
        "VITE_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  const supabase = getSupabase();

  return {
    async fetchPlayerActivity(): Promise<PlayerActivity[]> {
      const rows = await fetchAllPages((from, to, signal) =>
        supabase
          .from("v_jugadores_actividad")
          .select("jugador,ultima_partida")
          .order("jugador", { ascending: true })
          .range(from, to)
          .abortSignal(signal)
      );

      return rows
        .filter((row) => row.jugador !== null)
        .map((row) => ({
          nombre: row.jugador as string,
          ultimaPartida: row.ultima_partida,
        }));
    },

    async fetchPlayerLevels(): Promise<PlayerLevel[]> {
      // v_niveles_por_jugador, no v_nivel_jugadores: la segunda es el informe
      // filtrado (sólo por debajo de nivel 11 y con partida en 3 meses) y aquí
      // hacen falta todos los jugadores.
      const rows = await fetchAllPages((from, to, signal) =>
        supabase
          .from("v_niveles_por_jugador")
          // Una sola cadena literal: ver el comentario de fetchTournaments.
          .select("jugador,max_nivel_jugado,nivel_desbloqueado")
          .order("jugador", { ascending: true })
          .range(from, to)
          .abortSignal(signal)
      );

      return rows
        .filter((row) => row.jugador !== null)
        .map((row) => ({
          nombre: row.jugador as string,
          nivel: row.max_nivel_jugado,
          nivelDesbloqueado: row.nivel_desbloqueado,
        }));
    },

    async fetchPersonajes(): Promise<Personaje[]> {
      // Unas 1500 filas: pasa del tope de 1000 de PostgREST, así que la
      // paginación aquí no es teórica. Orden por id para que las páginas no se
      // solapen (el nombre se repite entre niveles).
      const rows = await fetchAllPages((from, to, signal) =>
        supabase
          .from("personajes")
          .select("nombre,nivel")
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(signal)
      );

      // PostgREST devuelve numeric como número JSON; Number() por si acaso
      // llegara como cadena, que es lo que hace con numeric de mucha precisión.
      return rows.map((row) => ({ nombre: row.nombre, nivel: Number(row.nivel) }));
    },

    async fetchTournaments(): Promise<TournamentSummary[]> {
      const rows = await fetchAllPages((from, to, signal) =>
        supabase
          .from("v_torneos_resumen")
          // Una sola cadena literal a propósito: PostgREST deduce los tipos de
          // las columnas del literal del select. Partirlo con + lo convierte en
          // `string` y las filas pasan a ser GenericStringError.
          .select("torneo_id,num_jugadores,max_num_partida,is_completed,scoring_system,jugadores_orden_original")
          .order("torneo_id", { ascending: true })
          .range(from, to)
          .abortSignal(signal)
      );

      return rows
        .filter((row) => row.torneo_id !== null)
        .map((row) => {
          const orden = row.jugadores_orden_original ?? [];
          return {
            torneoId: String(row.torneo_id),
            // La vista ya los da en orden de primera aparición; el alfabético
            // se calcula aquí sobre una copia, para no alterar el otro array.
            jugadores: orden.slice().sort(),
            jugadoresOrdenOriginal: orden,
            maxNumPartida: row.max_num_partida ?? 0,
            numJugadores: row.num_jugadores ?? 0,
            isCompleted: row.is_completed ?? false,
            scoringSystem: row.scoring_system,
          };
        });
    },

    async fetchTournamentRounds(torneoId: string): Promise<TournamentRounds> {
      const id = Number(torneoId);
      if (!Number.isFinite(id)) {
        throw new Error(`Identificador de torneo no numérico: "${torneoId}".`);
      }

      const rows = await fetchAllPages((from, to, signal) =>
        supabase
          .from("v_games")
          .select("num_partida,jugador,rol,puntos,ganada")
          .eq("torneo_id", id)
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(signal)
      );

      const rondas: TournamentRounds = new Map();
      for (const row of rows) {
        if (row.num_partida === null || row.jugador === null || row.rol === null) {
          continue;
        }
        let ronda = rondas.get(row.num_partida);
        if (!ronda) {
          ronda = new Map<string, RoundEntry>();
          rondas.set(row.num_partida, ronda);
        }
        ronda.set(row.jugador, {
          role: row.rol,
          score: row.puntos ?? 0,
          winner: row.ganada ?? false,
        });
      }
      return rondas;
    },
  };
}
