/**
 * Lógica pura de /estadisticas/partidas: lo que se calcula en el navegador a
 * partir de lo que devuelve la base de datos. Sin React ni Supabase, para poder
 * probarlo con vitest.
 *
 * Los recuentos ya vienen hechos de la base de datos (19_partidas_jugadas.sql y
 * 16_iniciaciones.sql). Aquí sólo se pivota, se ordena y se filtra.
 */

/** Una fila de v_partidas_por_anyo, con los nulos de la vista ya resueltos. */
export interface FilaAnyo {
  anyo: number;
  jugador: string;
  partidas: number;
}

/** Una fila de v_top_partidas_por_anyo. */
export interface FilaTop {
  anyo: number;
  pos: number;
  jugador: string;
  partidas: number;
}

/** Una fila de fn_iniciaciones. */
export interface FilaIniciacion {
  pos: number;
  jugador: string;
  iniciaciones: number;
  iniciados: number;
  debut_fecha: string | null;
  debut_torneo_id: number | null;
}

// ---------------------------------------------------------------------------
// Temporada
// ---------------------------------------------------------------------------

/** `null` es "toda la historia". */
export type Temporada = number | null;

/**
 * Argumentos de fn_partidas_por_rol para una temporada. Toda la historia es
 * sin argumentos: la función toma los NULL por defecto como "sin límite".
 */
export function rangoTemporada(
  temporada: Temporada
): { p_desde?: string; p_hasta?: string } {
  if (temporada === null) return {};
  return { p_desde: `${temporada}-01-01`, p_hasta: `${temporada}-12-31` };
}

// ---------------------------------------------------------------------------
// Matriz jugador × año
// ---------------------------------------------------------------------------

export interface FilaMatriz {
  jugador: string;
  /** Una celda por cada año de `anyos`, en el mismo orden. 0 si no jugó. */
  porAnyo: number[];
  total: number;
}

export interface Matriz {
  /** Años con alguna partida, ascendentes. */
  anyos: number[];
  filas: FilaMatriz[];
}

/**
 * Pivota las filas (año, jugador, partidas) a una fila por jugador con una
 * celda por año. Orden: más partidas en total primero; a igualdad, por nombre.
 *
 * Los años de las columnas salen de los propios datos, no de un rango fijo.
 */
export function pivotarPorAnyo(filas: FilaAnyo[]): Matriz {
  // Array.from y no spread: el tsconfig compila a un target sin iteración de
  // Set/Map.
  const anyos = Array.from(new Set(filas.map((f) => f.anyo))).sort(
    (a, b) => a - b
  );
  const indice = new Map(anyos.map((a, i) => [a, i]));

  const porJugador = new Map<string, FilaMatriz>();
  for (const f of filas) {
    let fila = porJugador.get(f.jugador);
    if (!fila) {
      fila = { jugador: f.jugador, porAnyo: anyos.map(() => 0), total: 0 };
      porJugador.set(f.jugador, fila);
    }
    // Suma y no asigna: si la vista devolviera dos filas del mismo par (no
    // debería), el total seguiría cuadrando con las puntuaciones.
    fila.porAnyo[indice.get(f.anyo)!] += f.partidas;
    fila.total += f.partidas;
  }

  const ordenadas = Array.from(porJugador.values()).sort(
    (a, b) => b.total - a.total || a.jugador.localeCompare(b.jugador, "es")
  );
  return { anyos, filas: ordenadas };
}

/**
 * El total de cada columna de la matriz: partidas jugadas por todos en ese año
 * (filas de `puntuaciones`, o sea jugador-partida).
 */
export function totalesColumna(matriz: Matriz): number[] {
  return matriz.anyos.map((_, i) =>
    matriz.filas.reduce((s, f) => s + f.porAnyo[i], 0)
  );
}

// ---------------------------------------------------------------------------
// Top por año
// ---------------------------------------------------------------------------

export interface TopAnyo {
  anyo: number;
  filas: FilaTop[];
}

/**
 * Agrupa el top por año, de más reciente a más antiguo. Dentro de cada año,
 * por puesto y a igualdad por nombre. Conserva `pos` tal cual viene: con
 * empates hay puestos repetidos y años con más de seis filas.
 */
export function topPorAnyo(filas: FilaTop[]): TopAnyo[] {
  const grupos = new Map<number, FilaTop[]>();
  for (const f of filas) {
    const g = grupos.get(f.anyo);
    if (g) g.push(f);
    else grupos.set(f.anyo, [f]);
  }
  return Array.from(grupos.entries())
    .sort(([a], [b]) => b - a)
    .map(([anyo, g]) => ({
      anyo,
      filas: [...g].sort(
        (a, b) => a.pos - b.pos || a.jugador.localeCompare(b.jugador, "es")
      ),
    }));
}

// ---------------------------------------------------------------------------
// Debut e iniciaciones
// ---------------------------------------------------------------------------

export interface FilaDebut {
  jugador: string;
  fecha: string;
}

/**
 * La "fecha de inicio por jugador": quien tiene debut, del más antiguo al más
 * reciente, y por nombre en la misma fecha. Las fechas son ISO (AAAA-MM-DD),
 * así que se comparan como texto.
 */
export function debuts(filas: FilaIniciacion[]): FilaDebut[] {
  return filas
    .filter((f): f is FilaIniciacion & { debut_fecha: string } =>
      f.debut_fecha !== null
    )
    .map((f) => ({ jugador: f.jugador, fecha: f.debut_fecha }))
    .sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        a.jugador.localeCompare(b.jugador, "es")
    );
}

/**
 * La tabla de iniciaciones, por puesto y nombre. Sin `mostrarCeros`, fuera
 * quien no ha visto debutar a nadie (casi la mitad de la tabla).
 */
export function tablaIniciaciones(
  filas: FilaIniciacion[],
  mostrarCeros: boolean
): FilaIniciacion[] {
  return filas
    .filter((f) => mostrarCeros || f.iniciados > 0)
    .sort((a, b) => a.pos - b.pos || a.jugador.localeCompare(b.jugador, "es"));
}
