/**
 * Agregación de las estadísticas del espía.
 *
 * `fn_espia` devuelve una fila por jugador y tamaño de mesa (ver
 * BD/migration/pg/17_espia.sql) y aquí se suma. Lógica pura, para poder
 * probarla sin Supabase ni navegador.
 *
 * Reglas:
 *  - Las partidas sin un ganador claro no cuentan en los porcentajes de quién
 *    gana (ver ../comun/reparto.ts). En "cuánto le toca" sí cuentan: que te
 *    toque espía no depende de quién gane.
 *  - Porcentajes con un decimal. Sin partidas, la fila no se devuelve.
 *  - Los nombres se comparan en minúsculas, porque en la BD son citext.
 *
 * `fn_espia` trae también `espia_ganadas` (victorias propias como espía). La
 * página ya no lo pinta: el informe "Victorias como espía" se quitó por
 * redundante con el de equilibrio. Se queda en la función porque es barato y
 * no estorba.
 */

import {
  conGanador,
  pct,
  reparto,
  type Reparto,
} from "../comun/reparto";

/** Una fila de `fn_espia`. */
export interface FilaEspia {
  jugador: string;
  num_jugadores: number;
  partidas: number;
  espia: number;
  prob_esperada_sum: number;
  gana_rey: number;
  gana_rebeldes: number;
  gana_espia: number;
  sin_ganador: number;
  activo: boolean;
}

/**
 * Mesas con un único reparto de roles en `role_distributions`: las impares y la
 * de 10. Con 4, 6 y 8 caben dos repartos distintos (1 o 2 espías, 0 o 1 leal) y
 * la probabilidad de ganar del espía no es comparable entre partidas.
 */
export const esMesaEquilibrio = (n: number): boolean =>
  n === 10 || (n >= 5 && n % 2 === 1);

const porNombre = (a: string, b: string): number =>
  a.localeCompare(b, "es", { sensitivity: "base" });

interface SumaJugador {
  jugador: string;
  partidas: number;
  espia: number;
  prob_esperada_sum: number;
  gana_rey: number;
  gana_rebeldes: number;
  gana_espia: number;
  sin_ganador: number;
}

/**
 * Suma las filas de cada jugador activo que pasen el filtro de mesa. La clave
 * va en minúsculas (citext) y se conserva la grafía de la primera fila.
 */
function sumarPorJugador(
  filas: FilaEspia[],
  mesa: (n: number) => boolean
): SumaJugador[] {
  const mapa = new Map<string, SumaJugador>();
  for (const f of filas) {
    if (!f.activo || !mesa(f.num_jugadores)) continue;
    const clave = f.jugador.toLowerCase();
    const acc = mapa.get(clave) ?? {
      jugador: f.jugador,
      partidas: 0,
      espia: 0,
      prob_esperada_sum: 0,
      gana_rey: 0,
      gana_rebeldes: 0,
      gana_espia: 0,
      sin_ganador: 0,
    };
    acc.partidas += f.partidas;
    acc.espia += f.espia;
    // numeric llega de PostgREST como número; Number() por si algún día llega
    // como cadena, que es como lo serializa cuando no cabe en un double.
    acc.prob_esperada_sum += Number(f.prob_esperada_sum);
    acc.gana_rey += f.gana_rey;
    acc.gana_rebeldes += f.gana_rebeldes;
    acc.gana_espia += f.gana_espia;
    acc.sin_ganador += f.sin_ganador;
    mapa.set(clave, acc);
  }
  return Array.from(mapa.values());
}

// ---------------------------------------------------------------------------
// A quién le toca ser espía
// ---------------------------------------------------------------------------

export interface CuantoLeToca {
  jugador: string;
  partidas: number;
  espia: number;
  /** % de sus partidas en que le tocó espía. */
  real: number;
  /** % que le habría tocado según la composición de sus mesas. */
  esperado: number;
  /** real - esperado, en puntos porcentuales. */
  desviacion: number;
}

/**
 * Todas las mesas y sólo jugadores activos. Quien nunca fue espía sale con 0:
 * es el caso más interesante de un informe sobre si el reparto es justo.
 * Orden: % real descendente, luego partidas, luego nombre.
 */
export function cuantoLeToca(filas: FilaEspia[]): CuantoLeToca[] {
  return sumarPorJugador(filas, () => true)
    .filter((j) => j.partidas > 0)
    .map((j) => {
      const real = pct(j.espia, j.partidas);
      const esperado = pct(j.prob_esperada_sum, j.partidas);
      return {
        jugador: j.jugador,
        partidas: j.partidas,
        espia: j.espia,
        real,
        esperado,
        desviacion: Math.round((real - esperado) * 10) / 10,
      };
    })
    .sort(
      (a, b) =>
        b.real - a.real ||
        b.partidas - a.partidas ||
        porNombre(a.jugador, b.jugador)
    );
}

// ---------------------------------------------------------------------------
// Quién gana cuando le toca espía
// ---------------------------------------------------------------------------

export interface Equilibrio extends Reparto {
  jugador: string;
  /** Partidas de espía con ganador claro: el denominador. */
  partidas: number;
  sinGanador: number;
  gana_rey: number;
  gana_rebeldes: number;
  gana_espia: number;
}

/**
 * Quién ganó cuando le tocó espía. Mesas de 5, 7, 9 y 10; jugadores activos
 * con al menos una partida de espía con ganador (sin ella no hay barra que
 * dibujar). Orden pedido: % de victorias del Rey descendente, luego partidas,
 * luego nombre.
 */
export function equilibrio(filas: FilaEspia[]): Equilibrio[] {
  return sumarPorJugador(filas, esMesaEquilibrio)
    .filter((j) => conGanador(j) > 0)
    .map((j) => ({
      jugador: j.jugador,
      partidas: conGanador(j),
      sinGanador: j.sin_ganador,
      gana_rey: j.gana_rey,
      gana_rebeldes: j.gana_rebeldes,
      gana_espia: j.gana_espia,
      ...reparto(j),
    }))
    .sort(
      (a, b) =>
        b.rey - a.rey ||
        b.partidas - a.partidas ||
        porNombre(a.jugador, b.jugador)
    );
}
