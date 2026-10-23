export interface AsientoMesa {
  jugadorId: string;
  filaPersonaje: number | null;
}

const MIN_JUGADORES = 5;
const MAX_JUGADORES = 10;

export function posicionAsiento(
  indice: number,
  total: number,
  anchoAsiento = 16
): { x: number; y: number } {
  const angulo = -Math.PI / 2 - (2 * Math.PI * indice) / total;
  const radioHorizontal = Math.min(42, 48 - anchoAsiento / 2);
  return {
    x: 50 + radioHorizontal * Math.cos(angulo),
    y: 50 + 40 * Math.sin(angulo),
  };
}

export function crearRutaMesa(
  baseUrl: string,
  jugadores: string[],
  filasPersonajes: (number | null)[]
): string {
  const url = new URL("mesa", baseUrl);
  url.searchParams.set("jugadores", JSON.stringify(jugadores));
  url.searchParams.set("personajes", JSON.stringify(filasPersonajes));
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

    return jugadores.map((jugador, indice) => ({
      jugadorId: jugador,
      filaPersonaje: filasPersonajes[indice],
    }));
  } catch {
    return null;
  }
}
