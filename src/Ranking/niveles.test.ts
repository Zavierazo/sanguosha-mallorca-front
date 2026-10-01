import { describe, expect, it } from "vitest";
import {
  esNivelPartida,
  siguienteNivelEntero,
  sueloDelTramo,
} from "./niveles";

describe("sueloDelTramo", () => {
  it("tramos 1-6.5, 7-12, 13-14 y 15", () => {
    expect(sueloDelTramo(1)).toBe(1);
    expect(sueloDelTramo(5)).toBe(1);
    expect(sueloDelTramo(6.5)).toBe(1);
    expect(sueloDelTramo(7)).toBe(7);
    expect(sueloDelTramo(9)).toBe(7);
    expect(sueloDelTramo(12)).toBe(7);
    expect(sueloDelTramo(13)).toBe(13);
    expect(sueloDelTramo(14)).toBe(13);
    expect(sueloDelTramo(15)).toBe(15);
  });
});

describe("NIVELES_PARTIDA", () => {
  it("son los enteros 1..15 y el 6.5", () => {
    expect(esNivelPartida(6.5)).toBe(true);
    expect(esNivelPartida(6.4)).toBe(false);
    expect(esNivelPartida(7.4)).toBe(false);
    expect(esNivelPartida(0)).toBe(false);
    expect(esNivelPartida(16)).toBe(false);
  });
});

describe("siguienteNivelEntero", () => {
  it("el 6.5 no cuenta como escalón", () => {
    expect(siguienteNivelEntero(6)).toBe(7);
    expect(siguienteNivelEntero(6.5)).toBe(7);
    expect(siguienteNivelEntero(14)).toBe(15);
    expect(siguienteNivelEntero(15)).toBeNull();
  });
});
