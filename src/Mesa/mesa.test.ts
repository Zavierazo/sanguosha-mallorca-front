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

  it("deja margen para los asientos más anchos de una mesa de cinco", () => {
    const asientoIzquierdo = posicionAsiento(1, 5, 28.5);

    expect(asientoIzquierdo.x).toBeGreaterThan(28.5 / 2);
  });
});
