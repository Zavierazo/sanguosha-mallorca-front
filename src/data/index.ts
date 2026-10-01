/**
 * Acceso de lectura a los datos: Supabase y nada más.
 *
 * Aquí vivía la conmutación entre Supabase y una copia de los datos en una hoja
 * de Google, con vuelta atrás automática. Se ha retirado: la hoja llevaba tiempo
 * sin actualizarse y servir datos viejos sin que se note es peor que fallar a la
 * vista. Sobre todo en esta web, donde con esos datos se apuntan puntuaciones.
 *
 * Lo que la sustituye:
 *
 *   1. Un reintento automático de cada lectura, para lo que la biblioteca no
 *      reintenta ella sola (ver abajo).
 *
 *   2. Si aun así no hay datos, el error se propaga y la pantalla lo cuenta y
 *      ofrece reintentar. Reintentar así, y no recargando la página, es
 *      deliberado: recargar tiraría lo que no está en localStorage (el orden de
 *      introducción de los jugadores, y con él "Restore Original Order", y el
 *      nivel puesto a mano) y volvería a descargar el bundle justo cuando la red
 *      es el problema.
 *
 * El tope de tiempo por operación está en ./supabaseSource.ts, porque hace falta
 * la señal de aborto de cada consulta.
 */

import { createSupabaseSource, TimeoutLecturaError } from "./supabaseSource";
import type { DataSource } from "./types";

export * from "./types";

/**
 * Intentos por operación y espera antes del reintento.
 *
 * Dos intentos, no más, y esto es importante: **postgrest-js ya reintenta por su
 * cuenta** (2.112.0 lo hace hasta tres veces, con su propia espera creciente y
 * respetando `Retry-After`), pero sólo para errores de red y para los HTTP 503 y
 * 520. Encadenar aquí tres intentos más daría hasta nueve peticiones para un
 * corte de red, que es tiempo perdido delante de una pantalla parada.
 *
 * Este reintento existe para lo que la biblioteca deja pasar:
 *
 *   - El HTTP 500 con código 57014, que es el `statement_timeout` de 3 segundos
 *     del rol `anon`. No es un 503, así que no se reintenta abajo, y sí suele
 *     salir bien a la segunda cuando la caché del plan ya está caliente.
 *   - Un error de PostgREST cualquiera que resulte pasajero.
 *
 * Lo que NO se reintenta es el tope de tiempo: si la base de datos no ha dicho
 * nada en diez segundos, esperar otros diez sólo retrasa el aviso.
 */
const ESPERA_MS = 600;
const INTENTOS = 2;

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/**
 * La instancia se crea tarde y se memoriza.
 *
 * Tarde porque el constructor lanza si faltan las variables de entorno, y ese
 * fallo tiene que llegar a la pantalla como cualquier otro en lugar de tumbar el
 * módulo al importarse.
 */
let instancia: DataSource | null = null;

function fuente(): DataSource {
  instancia ??= createSupabaseSource();
  return instancia;
}

async function leer<T>(
  operacion: string,
  llamada: (source: DataSource) => Promise<T>
): Promise<T> {
  // Fuera del bucle: si falta la configuración no hay nada que reintentar, y el
  // mensaje ("faltan VITE_SUPABASE_*") no es el de una base de datos caída.
  const source = fuente();

  let ultimo: unknown;
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      return await llamada(source);
    } catch (error) {
      ultimo = error;
      if (intento === INTENTOS || error instanceof TimeoutLecturaError) break;
      console.warn(
        `[datos] "${operacion}" ha fallado (intento ${intento} de ${INTENTOS}). ` +
          `Reintentando en ${ESPERA_MS} ms.`,
        error
      );
      await esperar(ESPERA_MS);
    }
  }

  console.error(`[datos] "${operacion}" no ha podido leerse.`, ultimo);
  throw ultimo;
}

/** Mensaje legible de un fallo de lectura, para enseñarlo como detalle. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * La fuente de datos de la web. Una sola instancia, con reintentos.
 *
 * No es un objeto con estado: no hay nada que consultar sobre "qué fuente está
 * respondiendo" porque sólo hay una. Cada pantalla gestiona su propio error.
 */
export const datos: DataSource = {
  fetchPlayerActivity: () =>
    leer("fetchPlayerActivity", (source) => source.fetchPlayerActivity()),

  fetchPersonajes: () =>
    leer("fetchPersonajes", (source) => source.fetchPersonajes()),

  fetchPlayerLevels: () =>
    leer("fetchPlayerLevels", (source) => source.fetchPlayerLevels()),

  fetchTournaments: () =>
    leer("fetchTournaments", (source) => source.fetchTournaments()),

  fetchTournamentRounds: (torneoId) =>
    leer("fetchTournamentRounds", (source) =>
      source.fetchTournamentRounds(torneoId)
    ),
};
