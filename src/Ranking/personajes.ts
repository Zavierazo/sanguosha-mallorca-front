import type { Personaje } from "../data";
import { sueloDelTramo } from "./niveles";

/**
 * Una opción del autocompletado de personaje.
 *
 * El catálogo repite nombres entre niveles (Sūn Quán está en 1, 7, 12, 13 y 14),
 * pero en `puntuaciones.personaje` sólo se guarda el nombre. Así que cada nombre
 * sale UNA vez, con todos sus niveles como dato informativo.
 */
export interface OpcionPersonaje {
  nombre: string;
  /** Los niveles en los que aparece, ordenados. */
  niveles: number[];
  /**
   * true si tiene algún nivel dentro del tramo de la partida (del corte
   * inferior hasta el nivel de la partida): va en el grupo de arriba.
   */
  delNivel: boolean;
}

export const GRUPO_OTROS = "Otros niveles";

/**
 * Lo que se sugiere primero para una partida de `nivel`: del inicio de su
 * tramo hasta ese nivel. Partida de 9 -> 7..9; de 5 -> 1..5; de 13 -> 13..13.
 */
export function rangoSugerido(nivel: number): { desde: number; hasta: number } {
  return { desde: sueloDelTramo(nivel), hasta: Number(nivel) };
}

/** "Nivel 7" / "Niveles 7 a 9". */
export const grupoDelNivel = (nivel: number): string => {
  const { desde, hasta } = rangoSugerido(nivel);
  return desde === hasta ? `Nivel ${desde}` : `Niveles ${desde} a ${hasta}`;
};

/**
 * Misma regla que el citext de la base de datos: `lower()`. No `localeCompare`
 * con sensitivity "base", que además ignoraría las tildes y declararía iguales
 * a "Diao Chan" y "Diāo Chán", que en el catálogo son personajes distintos.
 */
const clave = (nombre: string): string => nombre.trim().toLowerCase();

const alfabetico = (a: OpcionPersonaje, b: OpcionPersonaje) =>
  a.nombre.localeCompare(b.nombre, "es");

/**
 * Las opciones del autocompletado para una partida de `nivel`.
 *
 * Primero los personajes del tramo de la partida hasta su nivel (ver
 * `rangoSugerido`), en orden alfabético; después el resto en "Otros niveles". Se ofrece el catálogo entero y no sólo el nivel
 * porque el cliente pidió sugerir, no restringir: un personaje recién movido de
 * nivel tiene que poder elegirse igual.
 *
 * La grafía de cada opción es la de la primera fila del catálogo con ese nombre
 * (sin distinguir mayúsculas), dando preferencia a la del nivel de la partida.
 */
export function sugerenciasPersonaje(
  personajes: readonly Personaje[],
  nivel: number
): OpcionPersonaje[] {
  const porNombre = new Map<string, OpcionPersonaje>();
  const { desde, hasta } = rangoSugerido(nivel);

  for (const p of personajes) {
    const k = clave(p.nombre);
    if (!k) continue;
    const n = Number(p.nivel);
    const delNivel = n >= desde && n <= hasta;
    const existente = porNombre.get(k);
    if (!existente) {
      porNombre.set(k, { nombre: p.nombre.trim(), niveles: [p.nivel], delNivel });
      continue;
    }
    if (!existente.niveles.includes(p.nivel)) existente.niveles.push(p.nivel);
    if (delNivel && !existente.delNivel) {
      existente.delNivel = true;
      existente.nombre = p.nombre.trim();
    }
  }

  const opciones = Array.from(porNombre.values());
  for (const o of opciones) o.niveles.sort((a, b) => a - b);

  return [
    ...opciones.filter((o) => o.delNivel).sort(alfabetico),
    ...opciones.filter((o) => !o.delNivel).sort(alfabetico),
  ];
}

/**
 * La grafía del catálogo para `nombre`, o null si no está.
 *
 * Sirve para recolocar un valor guardado ("cao cao") en la opción del
 * autocompletado ("Cao Cao") y para saber si un valor ya no existe tras una
 * recarga del catálogo.
 */
export function buscarPersonaje(
  personajes: readonly Personaje[],
  nombre: string | null | undefined
): string | null {
  const k = clave(nombre ?? "");
  if (!k) return null;
  const encontrado = personajes.find((p) => clave(p.nombre) === k);
  return encontrado ? encontrado.nombre.trim() : null;
}
