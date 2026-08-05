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
 *
 * La correspondencia con la hoja de Google está verificada fila a fila con
 * huellas md5 en BD\migration\reconcile_hash.py: las dos fuentes son la misma
 * cosa salvo la grafía de 49 nombres, normalizada al migrar.
 */

import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import type {
  DataSource,
  PlayerActivity,
  PlayerLevel,
  RoundEntry,
  TournamentRounds,
  TournamentSummary,
} from "./types";

/** Tamaño de página. Coincide con el `db-max-rows` de Supabase. */
const PAGE_SIZE = 1000;

/**
 * Recorre una consulta por páginas hasta agotarla.
 *
 * `build` recibe el rango y devuelve la consulta ya acotada. Se le pasa el
 * rango en lugar de aplicarlo aquí porque los tipos de PostgrestFilterBuilder
 * no permiten reutilizar una consulta ya construida.
 */
async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
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
    id: "supabase",

    async fetchPlayerActivity(): Promise<PlayerActivity[]> {
      const rows = await fetchAllPages((from, to) =>
        supabase
          .from("v_jugadores_actividad")
          .select("jugador,ultima_partida")
          .order("jugador", { ascending: true })
          .range(from, to)
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
      const rows = await fetchAllPages((from, to) =>
        supabase
          .from("v_niveles_por_jugador")
          .select("jugador,max_nivel_jugado")
          .order("jugador", { ascending: true })
          .range(from, to)
      );

      return rows
        .filter((row) => row.jugador !== null)
        .map((row) => ({
          nombre: row.jugador as string,
          nivel: row.max_nivel_jugado,
        }));
    },

    async fetchTournaments(): Promise<TournamentSummary[]> {
      const rows = await fetchAllPages((from, to) =>
        supabase
          .from("v_torneos_resumen")
          // Una sola cadena literal a propósito: PostgREST deduce los tipos de
          // las columnas del literal del select. Partirlo con + lo convierte en
          // `string` y las filas pasan a ser GenericStringError.
          .select("torneo_id,num_jugadores,max_num_partida,is_completed,scoring_system,jugadores_orden_original")
          .order("torneo_id", { ascending: true })
          .range(from, to)
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

      const rows = await fetchAllPages((from, to) =>
        supabase
          .from("v_games")
          .select("num_partida,jugador,rol,puntos,ganada")
          .eq("torneo_id", id)
          .order("id", { ascending: true })
          .range(from, to)
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
