export interface AsientoMesa {
  jugadorId: string;
  filaPersonaje: number | null;
}

const MIN_JUGADORES = 5;
const MAX_JUGADORES = 10;

export function posicionAsiento(
  indice: number,
  total: number,
  anchoAsiento = 16,
  indicePerspectiva: number | null = null
): { x: number; y: number } {
  const indiceRelativo =
    indicePerspectiva === null
      ? indice
      : (indice - indicePerspectiva + total) % total;
  const angulo =
    (indicePerspectiva === null ? -Math.PI / 2 : Math.PI / 2) -
    (2 * Math.PI * indiceRelativo) / total;
  const radioHorizontal = Math.min(42, 48 - anchoAsiento / 2);
  return {
    x: 50 + radioHorizontal * Math.cos(angulo),
    y: 50 + 40 * Math.sin(angulo),
  };
}

export function crearRutaMesa(
  baseUrl: string,
  jugadores: string[],
  filasPersonajes: (number | null)[],
  rey?: string | null
): string {
  const url = new URL("mesa", baseUrl);
  url.searchParams.set("jugadores", JSON.stringify(jugadores));
  url.searchParams.set("personajes", JSON.stringify(filasPersonajes));
  if (rey) url.searchParams.set("rey", rey);
  return url.toString();
}

export function crearSearchFicha(search: string, filaPersonaje: number): string {
  const parametros = new URLSearchParams(search);
  parametros.set("ficha", String(filaPersonaje));
  return `?${parametros.toString()}`;
}

export function leerFilaFicha(search: string): number | null {
  const valor = new URLSearchParams(search).get("ficha");
  if (valor === null || !/^\d+$/.test(valor)) return null;
  const fila = Number(valor);
  return Number.isSafeInteger(fila) && fila > 0 ? fila : null;
}

/**
 * Dada la mesa ya orientada (asientos en orden de juego) y la fila de la ficha
 * abierta, devuelve la `filaPersonaje` del siguiente asiento navegable en orden
 * circular, saltando los asientos sin personaje (`filaPersonaje === null`).
 *
 * El punto de partida es el primer asiento cuyo `filaPersonaje` coincide con
 * `filaActual`. El siguiente asiento puede tener la misma fila (dos jugadores
 * con el mismo personaje): es un salto válido a otra posición de la mesa. Sólo
 * se devuelve `null` cuando no hay ningún OTRO asiento navegable al que ir: la
 * fila actual no está en la mesa, o es el único asiento con personaje.
 */
export function siguienteFilaFicha(
  asientos: AsientoMesa[],
  filaActual: number
): number | null {
  const total = asientos.length;
  const indicePartida = asientos.findIndex(
    (asiento) => asiento.filaPersonaje === filaActual
  );
  if (indicePartida < 0) return null;

  for (let paso = 1; paso <= total; paso += 1) {
    const indice = (indicePartida + paso) % total;
    if (indice === indicePartida) break;
    const fila = asientos[indice].filaPersonaje;
    if (fila !== null) return fila;
  }
  return null;
}

export function quitarFilaFicha(search: string): string {
  const parametros = new URLSearchParams(search);
  parametros.delete("ficha");
  const resultado = parametros.toString();
  return resultado ? `?${resultado}` : "";
}

export function leerAsientosMesa(search: string): AsientoMesa[] | null {
  const parametros = new URLSearchParams(search);
  const jugadoresJson = parametros.get("jugadores");
  const personajesJson = parametros.get("personajes");
  if (!jugadoresJson || !personajesJson) return null;

  try {
    const jugadores: unknown = JSON.parse(jugadoresJson);
    const filasPersonajes: unknown = JSON.parse(personajesJson);
    if (
      !Array.isArray(jugadores) ||
      jugadores.length < MIN_JUGADORES ||
      jugadores.length > MAX_JUGADORES ||
      !jugadores.every((jugador) => typeof jugador === "string" && jugador.trim()) ||
      !Array.isArray(filasPersonajes) ||
      filasPersonajes.length !== jugadores.length ||
      !filasPersonajes.every(
        (fila) => fila === null || (Number.isSafeInteger(fila) && fila > 0)
      )
    ) {
      return null;
    }

    const asientos = jugadores.map((jugador, indice) => ({
      jugadorId: jugador,
      filaPersonaje: filasPersonajes[indice],
    }));
    const rey = parametros.get("rey");
    const indiceRey = rey === null ? -1 : jugadores.indexOf(rey);
    const reyUnico =
      rey !== null &&
      indiceRey >= 0 &&
      jugadores.indexOf(rey, indiceRey + 1) === -1;
    if (!reyUnico) {
      return asientos;
    }

    return [...asientos.slice(indiceRey), ...asientos.slice(0, indiceRey)];
  } catch {
    return null;
  }
}
