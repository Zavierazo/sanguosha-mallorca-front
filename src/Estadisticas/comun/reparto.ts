/**
 * Aritmética común de los informes de "quién gana": la usan Qué bando gana
 * (../Bandos) y las estadísticas del espía (../Espia).
 *
 * El ganador de una partida es el bando del Rey (con sus leales), los rebeldes
 * o el espía. Las partidas sin un ganador claro (nadie marcado, o dos bandos a
 * la vez) no entran en el denominador: los porcentajes son sobre las partidas
 * con ganador, y cada pantalla dice aparte cuántas se han quedado fuera.
 */

/** Porcentaje con un decimal. Sin total, 0: nunca se divide entre cero. */
export const pct = (parte: number, total: number): number =>
  total > 0 ? Math.round((parte * 1000) / total) / 10 : 0;

/** Reparto de victorias entre los tres bandos, en % de partidas con ganador. */
export interface Reparto {
  rey: number;
  rebeldes: number;
  espia: number;
}

export interface Recuento {
  gana_rey: number;
  gana_rebeldes: number;
  gana_espia: number;
}

/** Partidas con un ganador claro. */
export const conGanador = (r: Recuento): number =>
  r.gana_rey + r.gana_rebeldes + r.gana_espia;

export const reparto = (r: Recuento): Reparto => {
  const total = conGanador(r);
  return {
    rey: pct(r.gana_rey, total),
    rebeldes: pct(r.gana_rebeldes, total),
    espia: pct(r.gana_espia, total),
  };
};

/** Suma de partidas sin ganador de una lista, para las notas bajo el gráfico. */
export const totalSinGanador = (lista: { sinGanador: number }[]): number =>
  lista.reduce((acc, x) => acc + x.sinGanador, 0);
