import { describe, expect, it } from "vitest";
import {
  crearRutaMesa,
  crearSearchFicha,
  leerAsientosMesa,
  leerFilaFicha,
  posicionAsiento,
  quitarFilaFicha,
} from "./mesa";

describe("enlace de mesa", () => {
  it("conserva el orden de jugadores y asocia las filas o los pendientes", () => {
    const url = crearRutaMesa(
      "https://ejemplo.test/app/",
      ["Ana", "Biel", "Carla", "Dani", "Eli"],
      [12, null, 28, null, 35]
    );

    expect(url).toContain("/app/mesa?");
    expect(leerAsientosMesa(new URL(url).search)).toEqual([
      { jugadorId: "Ana", filaPersonaje: 12 },
      { jugadorId: "Biel", filaPersonaje: null },
      { jugadorId: "Carla", filaPersonaje: 28 },
      { jugadorId: "Dani", filaPersonaje: null },
      { jugadorId: "Eli", filaPersonaje: 35 },
    ]);
  });

  it("rechaza enlaces con datos inválidos o un número de jugadores no admitido", () => {
    expect(leerAsientosMesa("?jugadores=bad&personajes=[]")).toBeNull();
    expect(
      leerAsientosMesa(
        `?jugadores=${encodeURIComponent(JSON.stringify(["Ana"]))}&personajes=%5Bnull%5D`
      )
    ).toBeNull();
  });

  it("añade y elimina la fila de personaje en el parámetro de navegación", () => {
    const search = "?jugadores=%5B%22Ana%22%5D&personajes=%5B12%5D";
    const fichaSearch = crearSearchFicha(search, 12);

    expect(leerFilaFicha(fichaSearch)).toBe(12);
    expect(quitarFilaFicha(fichaSearch)).toBe(search);
    expect(leerFilaFicha("?ficha=abc")).toBeNull();
    expect(leerFilaFicha("?ficha=0")).toBeNull();
  });

  it("conserva en el enlace la fila exacta elegida entre personajes duplicados", () => {
    const url = crearRutaMesa(
      "https://ejemplo.test/",
      ["Ana", "Biel", "Carla", "Dani", "Eli"],
      [701, 207, null, null, null]
    );

    expect(leerAsientosMesa(new URL(url).search)?.map((asiento) => asiento.filaPersonaje))
      .toEqual([701, 207, null, null, null]);
  });

  it("rota el orden para colocar al rey primero y conserva sus personajes", () => {
    const url = crearRutaMesa(
      "https://ejemplo.test/",
      ["A", "B", "C", "D", "E"],
      [10, 20, 30, 40, 50],
      "C"
    );

    expect(new URL(url).searchParams.get("rey")).toBe("C");
    expect(leerAsientosMesa(new URL(url).search)).toEqual([
      { jugadorId: "C", filaPersonaje: 30 },
      { jugadorId: "D", filaPersonaje: 40 },
      { jugadorId: "E", filaPersonaje: 50 },
      { jugadorId: "A", filaPersonaje: 10 },
      { jugadorId: "B", filaPersonaje: 20 },
    ]);
  });

  it("mantiene el orden original si el rey de la URL no es único o no está en la mesa", () => {
    const url = crearRutaMesa(
      "https://ejemplo.test/",
      ["A", "B", "C", "D", "E"],
      [10, 20, 30, 40, 50]
    );
    const parametros = new URL(url).searchParams;

    parametros.set("rey", "desconocido");
    expect(leerAsientosMesa(`?${parametros.toString()}`)?.[0].jugadorId).toBe("A");

    parametros.set("jugadores", JSON.stringify(["A", "B", "C", "D", "A"]));
    parametros.set("personajes", JSON.stringify([10, 20, 30, 40, 50]));
    parametros.set("rey", "A");
    expect(leerAsientosMesa(`?${parametros.toString()}`)?.map(({ jugadorId }) => jugadorId))
      .toEqual(["A", "B", "C", "D", "A"]);
  });

  it("coloca al primer jugador arriba y continúa en sentido antihorario", () => {
    const primero = posicionAsiento(0, 10);
    const segundo = posicionAsiento(1, 10);
    const tercero = posicionAsiento(2, 10);
    const opuesto = posicionAsiento(5, 10);

    expect(primero.x).toBeCloseTo(50);
    expect(primero.y).toBeCloseTo(10);
    expect(segundo.x).toBeLessThan(50);
    expect(segundo.y).toBeLessThan(50);
    expect(tercero.x).toBeLessThan(segundo.x);
    expect(tercero.y).toBeGreaterThan(segundo.y);
    expect(opuesto.y).toBeCloseTo(90);
  });

  it("coloca al jugador elegido abajo, al siguiente a su derecha y al anterior a su izquierda", () => {
    const total = 5;
    const abajo = posicionAsiento(2, total, 16, 2);
    const derecha = posicionAsiento(3, total, 16, 2);
    const izquierda = posicionAsiento(1, total, 16, 2);

    expect(abajo.x).toBeCloseTo(50);
    expect(abajo.y).toBeCloseTo(90);
    expect(derecha.x).toBeGreaterThan(50);
    expect(izquierda.x).toBeLessThan(50);
  });

  it("deja margen para los asientos más anchos de una mesa de cinco", () => {
    const asientoIzquierdo = posicionAsiento(1, 5, 28.5);

    expect(asientoIzquierdo.x).toBeGreaterThan(28.5 / 2);
  });
});
