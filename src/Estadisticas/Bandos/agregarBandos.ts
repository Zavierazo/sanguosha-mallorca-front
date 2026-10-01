/**
 * Agregación de "Qué bando gana" a partir de `v_ganador_por_mesa` (una fila por
 * tamaño de mesa; ver BD/migration/pg/17_espia.sql). Lógica pura.
 *
 * Las mesas de 4 jugadores quedan fuera, por decisión del cliente: son
 * excepcionales (una sola partida en toda la historia) y con un reparto de
 * roles propio. El filtro va aquí y no en la vista para que la vista siga
 * siendo el recuento completo y la regla viva en un solo sitio de la web.
 */

import {
  conGanador,
  reparto,
  type Reparto,
} from "../comun/reparto";

/** Mesas más pequeñas que esto no entran en el informe. */
export const MIN_JUGADORES = 5;

/** Una fila de `v_ganador_por_mesa`. */
export interface FilaMesa {
  num_jugadores: number;
  partidas: number;
  gana_rey: number;
  gana_rebeldes: number;
  gana_espia: number;
  sin_ganador: number;
}

interface Detalle extends Reparto {
  /** Partidas con un ganador claro: el denominador de los porcentajes. */
  partidas: number;
  sinGanador: number;
  gana_rey: number;
  gana_rebeldes: number;
  gana_espia: number;
}

export interface QuienGanaMesa extends Detalle {
  numJugadores: number;
}

export type QuienGanaTotal = Detalle;

const entra = (m: FilaMesa): boolean => m.num_jugadores >= MIN_JUGADORES;

/** Una fila por tamaño de mesa, de menor a mayor. Mesas sin ganador fuera. */
export function quienGanaPorMesa(mesas: FilaMesa[]): QuienGanaMesa[] {
  return mesas
    .filter((m) => entra(m) && conGanador(m) > 0)
    .map((m) => ({
      numJugadores: m.num_jugadores,
      partidas: conGanador(m),
      sinGanador: m.sin_ganador,
      gana_rey: m.gana_rey,
      gana_rebeldes: m.gana_rebeldes,
      gana_espia: m.gana_espia,
      ...reparto(m),
    }))
    .sort((a, b) => a.numJugadores - b.numJugadores);
}

/** Todas las mesas que entran, juntas, para el gráfico circular. */
export function quienGanaTotal(mesas: FilaMesa[]): QuienGanaTotal {
  const suma = mesas.filter(entra).reduce(
    (acc, m) => ({
      gana_rey: acc.gana_rey + m.gana_rey,
      gana_rebeldes: acc.gana_rebeldes + m.gana_rebeldes,
      gana_espia: acc.gana_espia + m.gana_espia,
      sin_ganador: acc.sin_ganador + m.sin_ganador,
    }),
    { gana_rey: 0, gana_rebeldes: 0, gana_espia: 0, sin_ganador: 0 }
  );
  return {
    partidas: conGanador(suma),
    sinGanador: suma.sin_ganador,
    gana_rey: suma.gana_rey,
    gana_rebeldes: suma.gana_rebeldes,
    gana_espia: suma.gana_espia,
    ...reparto(suma),
  };
}
