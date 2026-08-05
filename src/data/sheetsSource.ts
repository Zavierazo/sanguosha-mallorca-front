/**
 * Implementación sobre la hoja de Google, vía el endpoint `gviz/tq`.
 *
 * Es el código que vivía dentro de Ranking.tsx, movido aquí sin cambiarle la
 * semántica. Sigue siendo la vuelta atrás si Supabase falla, así que conviene
 * tocarlo lo menos posible: su valor está en que ya sabemos que funciona.
 *
 * Dos cosas sí cambian, ambas para bien y ninguna observable:
 *
 *   - la pestaña `Games` se descargaba dos veces (una para el selector y otra
 *     al continuar un torneo). Ahora se descarga una vez y se reutiliza.
 *   - los niveles llegaban como la cadena "NULL" y se convertían en NaN. Ahora
 *     son null, igual que en Supabase.
 */

import type {
  DataSource,
  PlayerActivity,
  PlayerLevel,
  RoundEntry,
  TournamentRounds,
  TournamentSummary,
} from "./types";

/**
 * gviz no devuelve JSON: devuelve una llamada a función JavaScript con el JSON
 * dentro. Hay que sacarlo con una expresión regular. Sin el flag `s`, que
 * obligaría a subir el target de TypeScript.
 */
const GVIZ_WRAPPER = /google\.visualization\.Query\.setResponse\(([\s\S]*)\)/;

/** Las fechas vienen como el literal `Date(2026,2,13)`, con el mes 0-based. */
const GVIZ_DATE = /^Date\((\d+),(\d+),(\d+)\)$/;

/** Índices de columna de la pestaña `Games`. */
const GAMES = {
  torneoId: 1,
  numPartida: 2,
  jugador: 3,
  rol: 4,
  puntos: 5,
  ganada: 6,
  fecha: 8,
  numJugadores: 9,
  scoringSystem: 11,
} as const;

/** Índices de columna de la pestaña `Exp`. */
const EXP = {
  jugador: 0,
  /** "nivel que corresponde", que es `max_nivel_jugado`. */
  nivel: 5,
} as const;

interface GvizCell {
  v?: string | number | boolean | null;
}

interface GvizRow {
  c?: (GvizCell | null)[] | null;
}

function cell(row: GvizRow, index: number): string | number | boolean | null {
  const cells = row.c;
  if (!cells || index >= cells.length) return null;
  return cells[index]?.v ?? null;
}

/** La hoja escribe los huecos como el texto "NULL", no como una celda vacía. */
function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" || text === "NULL" ? null : text;
}

function asNumber(value: unknown): number | null {
  const text = asText(value);
  if (text === null) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): string | null {
  const text = asText(value);
  if (text === null) return null;
  const match = GVIZ_DATE.exec(text);
  if (!match) return text;
  const year = Number(match[1]);
  const month = Number(match[2]) + 1;
  const day = Number(match[3]);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Una fila de la pestaña `Games` ya normalizada. */
interface GameRow {
  torneoId: string;
  numPartida: number | null;
  jugador: string;
  rol: string | null;
  puntos: number;
  ganada: boolean;
  fecha: string | null;
  numJugadores: number;
  scoringSystem: string | null;
}

async function fetchTab(sheetId: string, tab: string): Promise<GvizRow[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}` +
    `/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `La hoja de Google respondió ${response.status} para la pestaña "${tab}".`
    );
  }

  const match = GVIZ_WRAPPER.exec(await response.text());
  if (!match) {
    throw new Error(
      `Formato inesperado en la pestaña "${tab}" de la hoja de Google. ` +
        "Lo más probable es que la hoja haya dejado de ser pública."
    );
  }

  const payload = JSON.parse(match[1]);
  return (payload?.table?.rows ?? []) as GvizRow[];
}

export function createSheetsSource(
  sheetId: string = import.meta.env.VITE_GOOGLE_SHEET_ID,
  sheetName: string = import.meta.env.VITE_GOOGLE_SHEET_NAME || "Sheet1"
): DataSource {
  if (!sheetId) {
    throw new Error("Falta VITE_GOOGLE_SHEET_ID.");
  }

  // Una única descarga por instancia. Las cuatro consultas derivan de la misma
  // pestaña, así que no tiene sentido bajar 3 MB cuatro veces.
  let gamesPromise: Promise<GameRow[]> | null = null;

  function games(): Promise<GameRow[]> {
    if (!gamesPromise) {
      gamesPromise = fetchTab(sheetId, sheetName)
        .then((rows) => {
          const parsed: GameRow[] = [];
          for (const row of rows) {
            const jugador = asText(cell(row, GAMES.jugador));
            const torneoId = asText(cell(row, GAMES.torneoId));
            // La web siempre ha ignorado las filas sin jugador o sin torneo.
            if (jugador === null || torneoId === null) continue;
            parsed.push({
              torneoId,
              numPartida: asNumber(cell(row, GAMES.numPartida)),
              jugador,
              rol: asText(cell(row, GAMES.rol)),
              puntos: asNumber(cell(row, GAMES.puntos)) ?? 0,
              ganada: asNumber(cell(row, GAMES.ganada)) === 1,
              fecha: asDate(cell(row, GAMES.fecha)),
              numJugadores: asNumber(cell(row, GAMES.numJugadores)) ?? 0,
              scoringSystem: asDate(cell(row, GAMES.scoringSystem)),
            });
          }
          return parsed;
        })
        .catch((error) => {
          // Sin esto un fallo quedaría memorizado y el reintento del usuario
          // devolvería el mismo error sin volver a pedir nada.
          gamesPromise = null;
          throw error;
        });
    }
    return gamesPromise;
  }

  return {
    id: "sheets",

    async fetchPlayerActivity(): Promise<PlayerActivity[]> {
      const rows = await games();
      const ultima = new Map<string, string | null>();
      for (const row of rows) {
        if (!ultima.has(row.jugador)) {
          ultima.set(row.jugador, row.fecha);
          continue;
        }
        const previa = ultima.get(row.jugador) ?? null;
        // null gana: es "sin fecha", que siempre pasa el filtro de meses.
        if (previa === null || row.fecha === null) {
          ultima.set(row.jugador, null);
        } else if (row.fecha > previa) {
          ultima.set(row.jugador, row.fecha);
        }
      }
      return Array.from(ultima, ([nombre, ultimaPartida]) => ({
        nombre,
        ultimaPartida,
      }));
    },

    async fetchPlayerLevels(): Promise<PlayerLevel[]> {
      const rows = await fetchTab(sheetId, "Exp");
      const levels: PlayerLevel[] = [];
      for (const row of rows) {
        const nombre = asText(cell(row, EXP.jugador));
        if (nombre === null) continue;
        levels.push({ nombre, nivel: asNumber(cell(row, EXP.nivel)) });
      }
      return levels;
    },

    async fetchTournaments(): Promise<TournamentSummary[]> {
      const rows = await games();

      interface Acc {
        jugadores: Set<string>;
        jugadoresOrdenOriginal: string[];
        maxNumPartida: number;
        numJugadores: number;
        scoringSystem: string | null;
      }

      const porTorneo = new Map<string, Acc>();
      for (const row of rows) {
        let acc = porTorneo.get(row.torneoId);
        if (!acc) {
          // numJugadores y scoringSystem se toman de la primera fila del
          // torneo: son constantes dentro de él, vienen de `torneo`.
          acc = {
            jugadores: new Set(),
            jugadoresOrdenOriginal: [],
            maxNumPartida: 0,
            numJugadores: row.numJugadores,
            scoringSystem: row.scoringSystem,
          };
          porTorneo.set(row.torneoId, acc);
        }
        if (!acc.jugadores.has(row.jugador)) {
          acc.jugadores.add(row.jugador);
          acc.jugadoresOrdenOriginal.push(row.jugador);
        }
        if (row.numPartida !== null && row.numPartida > acc.maxNumPartida) {
          acc.maxNumPartida = row.numPartida;
        }
      }

      return Array.from(porTorneo, ([torneoId, acc]) => ({
        torneoId,
        jugadores: Array.from(acc.jugadores).sort(),
        jugadoresOrdenOriginal: acc.jugadoresOrdenOriginal,
        maxNumPartida: acc.maxNumPartida,
        numJugadores: acc.numJugadores,
        isCompleted: acc.maxNumPartida >= acc.numJugadores,
        scoringSystem: acc.scoringSystem,
      }));
    },

    async fetchTournamentRounds(torneoId: string): Promise<TournamentRounds> {
      const rows = await games();
      const rondas: TournamentRounds = new Map();
      for (const row of rows) {
        if (row.torneoId !== torneoId) continue;
        if (row.numPartida === null || row.rol === null) continue;
        let ronda = rondas.get(row.numPartida);
        if (!ronda) {
          ronda = new Map<string, RoundEntry>();
          rondas.set(row.numPartida, ronda);
        }
        ronda.set(row.jugador, {
          role: row.rol,
          score: row.puntos,
          winner: row.ganada,
        });
      }
      return rondas;
    },
  };
}
