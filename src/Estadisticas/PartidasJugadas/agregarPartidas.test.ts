import { describe, expect, it } from "vitest";
import {
  debuts,
  pivotarPorAnyo,
  rangoTemporada,
  tablaIniciaciones,
  topPorAnyo,
  totalesColumna,
  type FilaIniciacion,
} from "./agregarPartidas";

/**
 * Tests de la agregación de /estadisticas/partidas.
 *
 * Lo que se protege: que los huecos de la matriz son 0 y no undefined, el
 * orden de cada tabla, que los empates del top se conservan, y los filtros de
 * debut e iniciaciones.
 */

describe("rangoTemporada", () => {
  it("toda la historia va sin argumentos", () => {
    expect(rangoTemporada(null)).toEqual({});
  });

  it("un año va del 1 de enero al 31 de diciembre, ambos incluidos", () => {
    expect(rangoTemporada(2024)).toEqual({
      p_desde: "2024-01-01",
      p_hasta: "2024-12-31",
    });
  });
});

describe("pivotarPorAnyo", () => {
  const filas = [
    { anyo: 2024, jugador: "Arcan", partidas: 10 },
    { anyo: 2022, jugador: "Arcan", partidas: 5 },
    { anyo: 2024, jugador: "Miquel", partidas: 15 },
    { anyo: 2023, jugador: "Zatara", partidas: 15 },
  ];

  it("columnas ascendentes y huecos a 0", () => {
    const m = pivotarPorAnyo(filas);
    expect(m.anyos).toEqual([2022, 2023, 2024]);
    const arcan = m.filas.find((f) => f.jugador === "Arcan")!;
    expect(arcan.porAnyo).toEqual([5, 0, 10]);
    expect(arcan.total).toBe(15);
  });

  it("ordena por total descendente y desempata por nombre", () => {
    expect(pivotarPorAnyo(filas).filas.map((f) => f.jugador)).toEqual([
      "Arcan",
      "Miquel",
      "Zatara",
    ]);
  });

  it("los totales de columna suman las celdas", () => {
    expect(totalesColumna(pivotarPorAnyo(filas))).toEqual([5, 15, 25]);
  });

  it("sin datos, matriz vacía", () => {
    const m = pivotarPorAnyo([]);
    expect(m).toEqual({ anyos: [], filas: [] });
    expect(totalesColumna(m)).toEqual([]);
  });
});

describe("topPorAnyo", () => {
  it("agrupa del año más reciente al más antiguo y conserva los empates", () => {
    const top = topPorAnyo([
      { anyo: 2020, pos: 6, jugador: "Zeta", partidas: 3 },
      { anyo: 2020, pos: 1, jugador: "Uno", partidas: 9 },
      { anyo: 2020, pos: 6, jugador: "Alfa", partidas: 3 },
      { anyo: 2021, pos: 1, jugador: "Otro", partidas: 4 },
    ]);
    expect(top.map((t) => t.anyo)).toEqual([2021, 2020]);
    expect(top[1].filas.map((f) => [f.pos, f.jugador])).toEqual([
      [1, "Uno"],
      [6, "Alfa"],
      [6, "Zeta"],
    ]);
  });
});

const ini = (
  p: Partial<FilaIniciacion> & { jugador: string }
): FilaIniciacion => ({
  pos: 1,
  iniciaciones: 0,
  iniciados: 0,
  debut_fecha: "2020-01-01",
  debut_torneo_id: 1,
  ...p,
});

describe("debuts", () => {
  it("quita a quien no tiene debut y ordena por fecha y nombre", () => {
    expect(
      debuts([
        ini({ jugador: "Beta", debut_fecha: "2015-07-20" }),
        ini({ jugador: "Nadie", debut_fecha: null }),
        ini({ jugador: "Gamma", debut_fecha: "2024-03-01" }),
        ini({ jugador: "Alfa", debut_fecha: "2015-07-20" }),
      ])
    ).toEqual([
      { jugador: "Alfa", fecha: "2015-07-20" },
      { jugador: "Beta", fecha: "2015-07-20" },
      { jugador: "Gamma", fecha: "2024-03-01" },
    ]);
  });
});

describe("tablaIniciaciones", () => {
  const filas = [
    ini({ jugador: "Cero", pos: 3, iniciados: 0 }),
    ini({ jugador: "Segundo", pos: 2, iniciados: 4, iniciaciones: 2 }),
    ini({ jugador: "Primero", pos: 1, iniciados: 9, iniciaciones: 5 }),
  ];

  it("oculta los ceros por defecto", () => {
    expect(tablaIniciaciones(filas, false).map((f) => f.jugador)).toEqual([
      "Primero",
      "Segundo",
    ]);
  });

  it("con la casilla marcada salen todos, por puesto", () => {
    expect(tablaIniciaciones(filas, true).map((f) => f.jugador)).toEqual([
      "Primero",
      "Segundo",
      "Cero",
    ]);
  });
});
