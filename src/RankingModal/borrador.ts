/**
 * Borrador del modal de ronda.
 *
 * El caso de uso: al empezar la partida se abre el modal y se apuntan los
 * personajes; unas dos horas después, al acabar, se rellena el resultado y se
 * pulsa Submit. Entretanto el móvil se bloquea, el navegador descarta la
 * pestaña para ahorrar memoria y al volver RECARGA la página. Todo lo que había
 * en el modal vivía sólo en memoria y se perdía.
 *
 * Así que cada cambio del modal se guarda aquí, en localStorage, y al recargar
 * el modal reaparece abierto en la misma ronda tal como estaba. Submit borra el
 * borrador de esa ronda; Cancel lo conserva (reabrir la ronda lo recupera).
 *
 * Esto NO toca `playerScores`: el camino hacia la base de datos (envío, Raw
 * Data, resumen) sigue saliendo sólo de lo que se ha enviado con Submit.
 *
 * El riesgo propio de un borrador es que reaparezca donde no toca. Tres guardas:
 *
 *   - La MESA: la firma de los jugadores (ordenados, en minúsculas). Otra mesa,
 *     borrador ignorado. Reordenar no la cambia, y no hace falta: el modal
 *     guarda los datos por nombre (`Arcan_role`), no por posición.
 *   - La BASE: lo que la ronda tenía guardado cuando se escribió el borrador.
 *     Si eso ha cambiado por debajo (Continue Tournament, importar un Raw Data),
 *     el borrador ya no describe esta ronda.
 *   - La EDAD: más de CADUCIDAD_MS, ignorado. Sin esto, el mismo grupo en la
 *     sesión siguiente vería reaparecer los roles de la última ronda.
 */

import type { GameScore, PlayerScore } from "../Ranking/Ranking";

export const CLAVE_BORRADOR = "borradorRonda-v1";

/** Holgado para una partida de dos o tres horas; corto para la sesión siguiente. */
export const CADUCIDAD_MS = 12 * 60 * 60 * 1000;

export interface BorradorRonda {
  /** Ver `baseDeRonda`. */
  base: string;
  /** El `data` del formulario de jugadores (roles, vivos, personajes, ganador). */
  jugadores: Record<string, unknown>;
  /** El `data` del formulario de datos adicionales. */
  dinamicos: Record<string, unknown>;
  /** ISO. */
  actualizado: string;
}

export interface EstadoBorradores {
  version: 1;
  mesa: string;
  /** La ronda cuyo modal estaba abierto, o null. Es lo que se reabre al recargar. */
  abierta: number | null;
  rondas: Record<string, BorradorRonda>;
}

/** Firma de la mesa: quiénes juegan, sin importar el orden ni las mayúsculas. */
export function firmaMesa(jugadores: readonly string[]): string {
  return jugadores
    .map((j) => j.trim().toLowerCase())
    .sort()
    .join("|");
}

/**
 * Lo que la ronda tiene guardado, como cadena, indexado por NOMBRE de jugador.
 *
 * Por nombre y no por posición porque Randomize y Restore Original Order
 * reordenan columnas y puntuaciones a la vez: la ronda no ha cambiado, y el
 * borrador tiene que seguir valiendo.
 */
export function baseDeRonda(
  jugadores: readonly string[],
  previos: readonly (PlayerScore | undefined | null)[] | undefined,
  previo: GameScore | undefined | null
): string {
  const porJugador = jugadores
    .map((nombre, i) => {
      const p = previos?.[i];
      return [
        nombre.trim().toLowerCase(),
        p
          ? [p.role ?? null, p.score ?? 0, p.alive !== false, Boolean(p.winner), p.personaje ?? null]
          : null,
      ] as const;
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify({ j: porJugador, g: previo ?? null });
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Lee el texto de localStorage. Ante cualquier duda (JSON roto, otra versión,
 * forma inesperada) devuelve null: un borrador dudoso se tira, no se aplica.
 */
export function parsearEstado(texto: string | null): EstadoBorradores | null {
  if (!texto) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!esObjeto(crudo) || crudo.version !== 1 || typeof crudo.mesa !== "string") return null;
  if (!esObjeto(crudo.rondas)) return null;
  const abierta = typeof crudo.abierta === "number" ? crudo.abierta : null;

  const rondas: Record<string, BorradorRonda> = {};
  for (const [ronda, b] of Object.entries(crudo.rondas)) {
    if (
      esObjeto(b) &&
      typeof b.base === "string" &&
      esObjeto(b.jugadores) &&
      esObjeto(b.dinamicos) &&
      typeof b.actualizado === "string"
    ) {
      rondas[ronda] = {
        base: b.base,
        jugadores: b.jugadores,
        dinamicos: b.dinamicos,
        actualizado: b.actualizado,
      };
    }
  }
  return { version: 1, mesa: crudo.mesa, abierta, rondas };
}

const fresco = (b: BorradorRonda, ahora: Date): boolean => {
  const t = Date.parse(b.actualizado);
  return Number.isFinite(t) && ahora.getTime() - t <= CADUCIDAD_MS;
};

/** El borrador de `ronda` si es de esta mesa, de esta base y no ha caducado. */
export function borradorDeRonda(
  estado: EstadoBorradores | null,
  mesa: string,
  ronda: number,
  base: string,
  ahora: Date
): BorradorRonda | null {
  if (!estado || estado.mesa !== mesa) return null;
  const b = estado.rondas[String(ronda)];
  if (!b || b.base !== base || !fresco(b, ahora)) return null;
  return b;
}

/**
 * La ronda a reabrir al cargar la página, o null.
 *
 * Sólo si su borrador sigue siendo aplicable: reabrir un modal que va a
 * arrancar sin lo que se había escrito confundiría más que ayudar.
 */
export function rondaAReabrir(
  estado: EstadoBorradores | null,
  mesa: string,
  baseDe: (ronda: number) => string,
  ahora: Date
): number | null {
  if (!estado || estado.abierta === null) return null;
  return borradorDeRonda(estado, mesa, estado.abierta, baseDe(estado.abierta), ahora)
    ? estado.abierta
    : null;
}

/**
 * Apunta el borrador de `ronda` y la marca como abierta.
 *
 * Si el estado guardado es de otra mesa se empieza de cero: sus borradores ya
 * no le sirven a nadie. Los caducados se purgan de paso.
 */
export function conBorrador(
  estado: EstadoBorradores | null,
  mesa: string,
  ronda: number,
  borrador: Omit<BorradorRonda, "actualizado">,
  ahora: Date
): EstadoBorradores {
  const rondas: Record<string, BorradorRonda> = {};
  if (estado && estado.mesa === mesa) {
    for (const [r, b] of Object.entries(estado.rondas)) {
      if (fresco(b, ahora)) rondas[r] = b;
    }
  }
  rondas[String(ronda)] = { ...borrador, actualizado: ahora.toISOString() };
  return { version: 1, mesa, abierta: ronda, rondas };
}

/** Tras Submit: la ronda ya está en `playerScores`, su borrador sobra. */
export function sinBorrador(
  estado: EstadoBorradores | null,
  ronda: number
): EstadoBorradores | null {
  if (!estado) return null;
  const rondas = { ...estado.rondas };
  delete rondas[String(ronda)];
  return { ...estado, rondas, abierta: estado.abierta === ronda ? null : estado.abierta };
}

/** Al cerrar el modal (Submit, Cancel o clic fuera): no reabrirlo al recargar. */
export function cerrado(estado: EstadoBorradores | null): EstadoBorradores | null {
  return estado ? { ...estado, abierta: null } : null;
}

// ---------------------------------------------------------------------------
// localStorage. Defensivo: en incógnito o con el almacenamiento lleno puede
// lanzar, y perder el borrador nunca debe romper el modal.
// ---------------------------------------------------------------------------

export function leerBorradores(): EstadoBorradores | null {
  try {
    return parsearEstado(window.localStorage.getItem(CLAVE_BORRADOR));
  } catch {
    return null;
  }
}

export function escribirBorradores(estado: EstadoBorradores | null): void {
  try {
    if (estado === null) window.localStorage.removeItem(CLAVE_BORRADOR);
    else window.localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(estado));
  } catch {
    // Sin almacenamiento no hay borrador; el modal sigue funcionando.
  }
}
