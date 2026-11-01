/**
 * El nivel y el "ranked" de cada ronda: con qué valores arranca el modal y
 * cuándo avisar de que alguien puede subir de nivel.
 *
 * Son de cada ronda porque en la base de datos lo son (`partidas.nivel`,
 * `partidas.is_ranked`): alguien puede subir de nivel a mitad de un torneo, o
 * una ronda puede jugarse sin que cuente. Antes había un único desplegable en la
 * pantalla de Ranking para toda la sesión.
 *
 * Lógica pura, sin React, para poder probarla.
 */

import type { PlayerLevel } from "../data";
import type { GameScore } from "./Ranking";
import {
  esNivelPartida,
  NIVEL_MAXIMO,
  NIVEL_MINIMO,
  siguienteNivelEntero,
} from "./niveles";

/** De dónde sale el nivel con el que arranca el desplegable del modal. */
export type OrigenNivel = "propia" | "anterior" | "automatico";

export interface ValoresInicialesRonda {
  nivel: number;
  isRanked: boolean;
  /**
   * "automatico" es el único caso en que el modal sigue a `nivelAutomatico`
   * mientras nadie toque el desplegable: los niveles de los jugadores llegan de
   * la base de datos después de abrir la página.
   */
  origenNivel: OrigenNivel;
}

const nivelValido = (nivel: unknown): nivel is number =>
  typeof nivel === "number" && esNivelPartida(nivel);

/**
 * Los valores con los que nace el modal de la ronda `ronda` (empezando en 1).
 *
 *   1. Los de la propia ronda, si ya se envió con Submit (o se importó).
 *   2. Si no, los de la ronda ANTERIOR más cercana que los tenga. En un torneo
 *      se juega casi siempre al mismo nivel; si alguien sube a mitad, se cambia
 *      una vez y las siguientes lo heredan.
 *   3. Si no hay ninguna, el nivel automático (el mínimo de la mesa) y ranked.
 *
 * Cada campo se resuelve por separado. Sólo cuentan rondas enviadas: los
 * borradores no están en `gameScores`, y un borrador a medias no debería
 * decidir el nivel de otra ronda.
 *
 * Un nivel guardado que no está en NIVELES_PARTIDA se ignora: el desplegable
 * no marcaría ninguna opción y se guardaría un valor distinto del que se ve.
 */
export function valoresInicialesRonda(
  gameScores: readonly (GameScore | null | undefined)[],
  ronda: number,
  nivelAutomatico: number | null
): ValoresInicialesRonda {
  const propia = gameScores[ronda - 1];

  let nivel: number | null = null;
  let origenNivel: OrigenNivel = "automatico";
  if (nivelValido(propia?.nivel)) {
    nivel = Number(propia!.nivel);
    origenNivel = "propia";
  }
  let isRanked: boolean | null =
    typeof propia?.isRanked === "boolean" ? propia.isRanked : null;

  for (let r = ronda - 1; r >= 1 && (nivel === null || isRanked === null); r -= 1) {
    const anterior = gameScores[r - 1];
    if (nivel === null && nivelValido(anterior?.nivel)) {
      nivel = Number(anterior!.nivel);
      origenNivel = "anterior";
    }
    if (isRanked === null && typeof anterior?.isRanked === "boolean") {
      isRanked = anterior.isRanked;
    }
  }

  return {
    nivel:
      nivel ??
      (nivelAutomatico !== null && esNivelPartida(nivelAutomatico)
        ? Number(nivelAutomatico)
        : NIVEL_MINIMO),
    isRanked: isRanked ?? true,
    origenNivel,
  };
}

/**
 * Nivel de partida que se propone: el del jugador menos veterano de la mesa.
 *
 * Sin nivel cuenta como nivel 1, no como "no se sabe". Son dos casos: el
 * jugador que aún no tiene `max_nivel_jugado` y el que se acaba de crear en el
 * selector y no está en la tabla. En los dos, lo correcto es empezar por el
 * principio, y además arrastra el mínimo hacia abajo, que es el lado seguro: una
 * mesa se juega al nivel del que menos sabe.
 *
 * null si todavía no han llegado los niveles: con el mapa vacío daría 1 para
 * todo el mundo por la regla de "sin nivel = 1", y eso sería inventarse un dato.
 */
export function nivelAutomaticoMesa(
  jugadores: readonly string[],
  niveles: ReadonlyMap<string, PlayerLevel>
): number | null {
  if (niveles.size === 0) return null;
  if (jugadores.length === 0) return NIVEL_MINIMO;
  return Math.min(
    ...jugadores.map((j) => niveles.get(j)?.nivel ?? NIVEL_MINIMO)
  );
}

export interface AvisoNivel {
  jugadores: string[];
  /** El nivel de la mesa (el automático), del que habla el aviso. */
  nivelMesa: number;
  /** El menor nivel desbloqueado del grupo: "al menos el nivel N". */
  desbloqueado: number;
  /** El escalón que se propone. El aviso desaparece al llegar a él. */
  siguiente: number;
}

/**
 * Aviso de "puede que esta partida haga subir de nivel". Null si no procede.
 *
 * El nivel automático es `max_nivel_jugado`: lo que el jugador ha jugado, no lo
 * que se ha ganado. Cuando alguien ha desbloqueado por experiencia un nivel que
 * todavía no ha jugado, puede subir en cualquier momento, así que hay que
 * preguntar. Esa condición es exactamente `nivel_desbloqueado >
 * max_nivel_jugado`, el `completo` de `fn_nivel_jugadores` (el 100 % verde del
 * informe "Nivel jugadores"). No es `porcentaje >= 100`, que llega a 100 por
 * redondeo sin serlo.
 *
 * Tres decisiones que no son adivinables:
 *
 *   - Tienen que estar listos **todos** los que empatan en el mínimo. Si B
 *     también está a nivel 7 y no ha desbloqueado el 8, la mesa se juega a 7 y
 *     no hay nada que decidir. Peor aún, subir el nivel le daría a B un ascenso
 *     no ganado: su `max_nivel_jugado` pasa a ser el de esa partida.
 *   - Se propone **un escalón** (el siguiente entero), no el desbloqueado:
 *     pueden estar muy separados (9 jugado, 15 desbloqueado). Se acota al
 *     desbloqueado y a NIVEL_MAXIMO. Desde el 6 y desde el 6.5, el 7.
 *   - Con `nivel` o `nivelDesbloqueado` null no se afirma nada, como en la base
 *     de datos, donde la comparación con un NULL es desconocida.
 */
export function calcularAvisoNivel(
  jugadores: readonly string[],
  niveles: ReadonlyMap<string, PlayerLevel>
): AvisoNivel | null {
  const nivelMesa = nivelAutomaticoMesa(jugadores, niveles);
  if (jugadores.length === 0 || nivelMesa === null) return null;

  const enElMinimo = jugadores.filter(
    (j) => (niveles.get(j)?.nivel ?? NIVEL_MINIMO) === nivelMesa
  );

  const listos: { nombre: string; desbloqueado: number }[] = [];
  for (const nombre of enElMinimo) {
    const fila = niveles.get(nombre);
    if (!fila || fila.nivel === null || fila.nivelDesbloqueado === null) continue;
    if (fila.nivelDesbloqueado > fila.nivel) {
      listos.push({ nombre, desbloqueado: fila.nivelDesbloqueado });
    }
  }
  if (listos.length === 0 || listos.length !== enElMinimo.length) return null;

  const desbloqueado = Math.min(...listos.map((l) => l.desbloqueado));
  return {
    jugadores: listos.map((l) => l.nombre),
    nivelMesa,
    desbloqueado,
    siguiente: Math.min(
      NIVEL_MAXIMO,
      desbloqueado,
      siguienteNivelEntero(nivelMesa) ?? NIVEL_MAXIMO
    ),
  };
}

/** "Alig", "Alig y Han Jin", "Alig, Han Jin y Miquel". */
export const listarNombres = (nombres: readonly string[]): string =>
  nombres.length <= 1
    ? nombres.join("")
    : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
