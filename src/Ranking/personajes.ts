import type { Personaje } from "../data";
import { sueloDelTramo } from "./niveles";

export type PersonajeCatalogo = Pick<
  Personaje,
  "nombre" | "nivel" | "dinastia" | "filaExcel"
>;

/** Una opción representa una fila y una variante concretas del catálogo. */
export interface OpcionPersonaje {
  nombre: string;
  nivel: number;
  dinastia: string | null;
  filaExcel: number | null;
  /** true si esta variante pertenece al tramo sugerido para la partida. */
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
  a.nombre.localeCompare(b.nombre, "es") || a.nivel - b.nivel;

export function etiquetaOpcionPersonaje(opcion: OpcionPersonaje): string {
  const dinastia = opcion.dinastia ? `, ${opcion.dinastia}` : "";
  return `${opcion.nombre}  wgt ${opcion.nivel}${dinastia}`;
}

export function claveOpcionPersonaje(opcion: OpcionPersonaje): string {
  return opcion.filaExcel !== null
    ? `fila-${opcion.filaExcel}`
    : `${opcion.nombre.trim().toLowerCase()}-${opcion.nivel}-${opcion.dinastia ?? ""}`;
}

/**
 * Las opciones del autocompletado para una partida de `nivel`.
 *
 * Cada fila del catálogo aparece como una opción independiente. Primero se
 * muestran las variantes del tramo de la partida, después el resto.
 */
export function sugerenciasPersonaje(
  personajes: readonly PersonajeCatalogo[],
  nivel: number
): OpcionPersonaje[] {
  const { desde, hasta } = rangoSugerido(nivel);
  const opciones = personajes
    .filter((personaje) => clave(personaje.nombre))
    .map((personaje) => ({
      nombre: personaje.nombre.trim(),
      nivel: Number(personaje.nivel),
      dinastia: personaje.dinastia?.trim() || null,
      filaExcel: personaje.filaExcel ?? null,
      delNivel:
        Number(personaje.nivel) >= desde && Number(personaje.nivel) <= hasta,
    }));

  return [
    ...opciones.filter((o) => o.delNivel).sort(alfabetico),
    ...opciones.filter((o) => !o.delNivel).sort(alfabetico),
  ];
}

const cacheSugerencias = new WeakMap<
  readonly Personaje[],
  Map<number, OpcionPersonaje[]>
>();

export function sugerenciasPersonajeCompartidas(
  personajes: readonly PersonajeCatalogo[],
  nivel: number
): OpcionPersonaje[] {
  let porNivel = cacheSugerencias.get(personajes);
  if (!porNivel) {
    porNivel = new Map<number, OpcionPersonaje[]>();
    cacheSugerencias.set(personajes, porNivel);
  }
  let opciones = porNivel.get(nivel);
  if (!opciones) {
    opciones = sugerenciasPersonaje(personajes, nivel);
    porNivel.set(nivel, opciones);
  }
  return opciones;
}

/**
 * La grafía del catálogo para `nombre`, o null si no está.
 *
 * Sirve para recolocar un valor guardado ("cao cao") en la opción del
 * autocompletado ("Cao Cao") y para saber si un valor ya no existe tras una
 * recarga del catálogo.
 */
export function buscarPersonaje(
  personajes: readonly PersonajeCatalogo[],
  nombre: string | null | undefined
): string | null {
  const k = clave(nombre ?? "");
  if (!k) return null;
  const encontrado = personajes.find((p) => clave(p.nombre) === k);
  return encontrado ? encontrado.nombre.trim() : null;
}

/**
 * Variante que se propone para un nombre heredado que no tiene fila guardada.
 *
 * El formulario guarda sólo el nombre porque así lo requiere puntuaciones.
 * Para mostrar la ficha desde la mesa, se prefiere la fila del nivel exacto;
 * si no existe, se usa el nivel más alto disponible por debajo, o el más bajo
 * disponible si todos los niveles son superiores.
 */
export function filaExcelPersonajePorNivel(
  personajes: readonly PersonajeCatalogo[],
  nombre: string | null | undefined,
  nivel: number
): number | null {
  const k = clave(nombre ?? "");
  if (!k) return null;

  const candidatos = personajes.filter(
    (personaje): personaje is PersonajeCatalogo & { filaExcel: number } =>
      clave(personaje.nombre) === k &&
      typeof personaje.filaExcel === "number" &&
      Number.isSafeInteger(personaje.filaExcel) &&
      personaje.filaExcel > 0
  );
  const exacto = candidatos.find((personaje) => personaje.nivel === nivel);
  if (exacto?.filaExcel) return exacto.filaExcel;

  const anteriores = candidatos
    .filter((personaje) => personaje.nivel <= nivel)
    .sort((a, b) => b.nivel - a.nivel);
  const seleccionado = anteriores[0] ?? candidatos.sort((a, b) => a.nivel - b.nivel)[0];
  return seleccionado?.filaExcel ?? null;
}

/**
 * Mantiene una selección reciente mientras JsonForms actualiza el nombre
 * asociado en su propio ciclo de estado; en el resto de casos reconcilia con
 * el catálogo y aplica el fallback heredado.
 */
export function reconciliarFilaPersonaje(
  personajes: readonly PersonajeCatalogo[],
  nombre: string | null | undefined,
  filaActual: number | null | undefined,
  filaElegidaRecientemente: number | null | undefined,
  nivel: number
): number | null {
  if (!nombre?.trim()) {
    return filaElegidaRecientemente === filaActual ? filaActual ?? null : null;
  }

  const nombreNormalizado = clave(nombre);
  const filaCoincide =
    typeof filaActual === "number" &&
    personajes.some(
      (personaje) =>
        personaje.filaExcel === filaActual &&
        clave(personaje.nombre) === nombreNormalizado
    );
  if (filaCoincide || filaActual === filaElegidaRecientemente) {
    return filaActual ?? null;
  }

  return filaExcelPersonajePorNivel(personajes, nombre, nivel);
}
