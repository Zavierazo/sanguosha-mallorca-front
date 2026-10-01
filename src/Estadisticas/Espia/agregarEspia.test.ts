import { describe, expect, it } from "vitest";
import {
  cuantoLeToca,
  equilibrio,
  esMesaEquilibrio,
  type FilaEspia,
} from "./agregarEspia";
import { totalSinGanador } from "../comun/reparto";

/**
 * Tests de la agregación de /estadisticas/espia.
 *
 * Lo que se protege: qué mesas entran en cada informe (todas en "cuánto le
 * toca", sólo 5/7/9/10 en el equilibrio), que las partidas sin ganador no
 * deforman los porcentajes, el filtro de actividad y el orden.
 */

const fila = (p: Partial<FilaEspia> & { jugador: string }): FilaEspia => ({
  num_jugadores: 5,
  partidas: 0,
  espia: 0,
  prob_esperada_sum: 0,
  gana_rey: 0,
  gana_rebeldes: 0,
  gana_espia: 0,
  sin_ganador: 0,
  activo: true,
  ...p,
});

describe("esMesaEquilibrio", () => {
  it("acepta las impares desde 5 y la de 10", () => {
    expect([4, 5, 6, 7, 8, 9, 10].filter(esMesaEquilibrio)).toEqual([
      5, 7, 9, 10,
    ]);
  });
});

describe("A quién le toca ser espía", () => {
  const filas = [
    // Todas las mesas cuentan, también las de 4, 6 y 8.
    fila({ jugador: "Sarki", num_jugadores: 4, partidas: 4, espia: 1, prob_esperada_sum: 1 }),
    fila({ jugador: "Sarki", num_jugadores: 8, partidas: 8, espia: 2, prob_esperada_sum: 1.5 }),
    // Nunca fue espía: sale con 0.
    fila({ jugador: "Ruby", num_jugadores: 5, partidas: 2 }),
    fila({ jugador: "Retirado", partidas: 50, espia: 50, activo: false }),
  ];

  it("suma todas las mesas y calcula esperado y desviación", () => {
    const [sarki] = cuantoLeToca(filas);
    expect(sarki).toEqual({
      jugador: "Sarki",
      partidas: 12,
      espia: 3,
      real: 25,
      esperado: 20.8,
      desviacion: 4.2,
    });
  });

  it("incluye a quien nunca fue espía y excluye a los no activos", () => {
    expect(cuantoLeToca(filas).map((j) => [j.jugador, j.real])).toEqual([
      ["Sarki", 25],
      ["Ruby", 0],
    ]);
  });

  it("agrupa sin distinguir mayúsculas, como citext", () => {
    const r = cuantoLeToca([
      fila({ jugador: "AliG", partidas: 2, espia: 1 }),
      fila({ jugador: "Alig", num_jugadores: 7, partidas: 2 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ jugador: "AliG", partidas: 4, espia: 1 });
  });

  it("desempata por partidas y luego por nombre", () => {
    const r = cuantoLeToca([
      fila({ jugador: "Zeta", partidas: 10, espia: 2 }),
      fila({ jugador: "Beta", partidas: 5, espia: 1 }),
      fila({ jugador: "Alfa", partidas: 5, espia: 1 }),
    ]);
    expect(r.map((j) => j.jugador)).toEqual(["Zeta", "Alfa", "Beta"]);
  });
});

describe("Quién gana cuando le toca espía", () => {
  const filas = [
    fila({ jugador: "Sarki", num_jugadores: 5, espia: 4, gana_rey: 2, gana_rebeldes: 1, gana_espia: 1 }),
    fila({ jugador: "Sarki", num_jugadores: 8, espia: 9, gana_rebeldes: 9 }),
    fila({ jugador: "Arcan", num_jugadores: 7, espia: 5, gana_rey: 4, gana_espia: 1, sin_ganador: 1 }),
    fila({ jugador: "Nunca", num_jugadores: 5, partidas: 6 }),
    fila({ jugador: "Retirado", espia: 3, gana_rey: 3, activo: false }),
  ];

  it("ordena por % de victorias del Rey y deja fuera las mesas de 4, 6 y 8", () => {
    const r = equilibrio(filas);
    expect(r.map((j) => j.jugador)).toEqual(["Arcan", "Sarki"]);
    expect(r[1]).toMatchObject({ partidas: 4, rey: 50, rebeldes: 25, espia: 25 });
  });

  it("las partidas sin ganador no entran en el denominador pero se cuentan", () => {
    const [arcan] = equilibrio(filas);
    expect(arcan).toMatchObject({ partidas: 5, sinGanador: 1, rey: 80, espia: 20 });
    expect(totalSinGanador(equilibrio(filas))).toBe(1);
  });

  it("deja fuera a quien no ha sido espía en esas mesas y a los no activos", () => {
    const nombres = equilibrio(filas).map((j) => j.jugador);
    expect(nombres).not.toContain("Nunca");
    expect(nombres).not.toContain("Retirado");
  });

  it("empate en % del Rey: más partidas primero, luego nombre", () => {
    const r = equilibrio([
      fila({ jugador: "B", espia: 2, gana_rey: 1, gana_rebeldes: 1 }),
      fila({ jugador: "C", espia: 4, gana_rey: 2, gana_rebeldes: 2 }),
      fila({ jugador: "A", espia: 2, gana_rey: 1, gana_espia: 1 }),
    ]);
    expect(r.map((j) => j.jugador)).toEqual(["C", "A", "B"]);
  });
});
