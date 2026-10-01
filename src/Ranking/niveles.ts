/**
 * Niveles de partida válidos: los enteros 1..15 y el 6.5.
 *
 * Es la única lista del front, y tiene que coincidir con otros dos sitios:
 *   - el CHECK de `public.personajes.nivel` (BD/migration/pg/18_personajes.sql)
 *   - NIVELES_VALIDOS de BD/migration/personajes/limpiar_personajes.py
 *
 * El 6.5 existe en `partidas.nivel` desde antes de esta lista. Mientras el
 * desplegable sólo tenía enteros, una mesa cuyo nivel calculado fuera 6.5 no
 * marcaba ninguna opción: el navegador pintaba la primera y se habría guardado
 * un valor distinto del que se veía.
 *
 * El 0 no es un nivel: `partidas.nivel` multiplica la experiencia con la fórmula
 * `xp_base + incremento * (nivel - 1)`, así que un 0 daría MENOS experiencia que
 * un 1 (16,5 en vez de 20).
 */
export const NIVELES_PARTIDA: readonly number[] = [
  1, 2, 3, 4, 5, 6, 6.5, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

export const NIVEL_MINIMO = NIVELES_PARTIDA[0];
export const NIVEL_MAXIMO = NIVELES_PARTIDA[NIVELES_PARTIDA.length - 1];

export const esNivelPartida = (nivel: number): boolean =>
  NIVELES_PARTIDA.includes(Number(nivel));

/**
 * Dónde empieza cada tramo de niveles: 1 a 6.5, 7 a 12, 13 a 14 y 15 solo.
 * Definidos por el cliente.
 */
export const CORTES_NIVEL: readonly number[] = [1, 7, 13, 15];

/** El inicio del tramo al que pertenece `nivel`: 9 -> 7, 6.5 -> 1, 14 -> 13. */
export function sueloDelTramo(nivel: number): number {
  let suelo = CORTES_NIVEL[0];
  for (const corte of CORTES_NIVEL) if (corte <= nivel) suelo = corte;
  return suelo;
}

/**
 * El siguiente nivel ENTERO, o null si ya está en el máximo.
 *
 * Los niveles que se desbloquean por experiencia son enteros (la tabla
 * `niveles` no tiene 6.5), así que el 6.5 no cuenta como escalón: desde el 6 y
 * desde el 6.5 el siguiente es el 7.
 */
export function siguienteNivelEntero(nivel: number): number | null {
  const siguiente = Math.floor(nivel) + 1;
  return siguiente > NIVEL_MAXIMO ? null : siguiente;
}
