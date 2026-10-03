import { describe, expect, it } from "vitest";
import {
  baseDeRonda,
  borradorDeRonda,
  CADUCIDAD_MS,
  cerrado,
  conBorrador,
  firmaMesa,
  parsearEstado,
  rondaAReabrir,
  sinBorrador,
} from "./borrador";
import type { PlayerScore } from "../Ranking/Ranking";

/**
 * Lo que se protege: que un borrador viejo NO se aplique a una partida que no
 * es la suya. Si estas guardas fallan, al abrir una ronda aparecen roles y
 * personajes de otra mesa o de la sesión de la semana pasada, y alguien los
 * envía sin darse cuenta.
 */

const T0 = new Date("2026-10-03T18:00:00Z");
const mas = (ms: number) => new Date(T0.getTime() + ms);

const mesa = ["Arcan", "Miquel", "AliG", "Zatara", "Danu"];
const MESA = firmaMesa(mesa);
const BASE_VACIA = baseDeRonda(mesa, undefined, undefined);
const datos = { jugadores: { Arcan_personaje: "Cáo Cāo" }, dinamicos: {} };

const conUno = () => conBorrador(null, MESA, 2, { base: BASE_VACIA, ...datos }, T0);

describe("borradorDeRonda: cuándo se aplica", () => {
  it("misma mesa, misma base y reciente: se aplica", () => {
    expect(borradorDeRonda(conUno(), MESA, 2, BASE_VACIA, mas(2 * 3600_000))?.jugadores)
      .toEqual(datos.jugadores);
  });

  it("la misma mesa reordenada o con otras mayúsculas sigue valiendo", () => {
    const otraOrden = firmaMesa(["danu", "Zatara", "ALIG", "Miquel", "Arcan"]);
    expect(otraOrden).toBe(MESA);
    expect(borradorDeRonda(conUno(), otraOrden, 2, BASE_VACIA, T0)).not.toBeNull();
  });

  it("otra mesa: no se aplica", () => {
    const otra = firmaMesa([...mesa.slice(0, 4), "Chirimoya"]);
    expect(borradorDeRonda(conUno(), otra, 2, BASE_VACIA, T0)).toBeNull();
  });

  it("otra ronda: no se aplica", () => {
    expect(borradorDeRonda(conUno(), MESA, 3, BASE_VACIA, T0)).toBeNull();
  });

  it("caducado (sesión siguiente): no se aplica", () => {
    expect(borradorDeRonda(conUno(), MESA, 2, BASE_VACIA, mas(CADUCIDAD_MS + 1))).toBeNull();
  });

  it("la ronda cambió por debajo (Continue Tournament / importar): no se aplica", () => {
    const fila = (role: string): PlayerScore => ({ role, score: 5, alive: true, winner: false });
    const nueva = baseDeRonda(mesa, mesa.map(() => fila("V")), undefined);
    expect(borradorDeRonda(conUno(), MESA, 2, nueva, T0)).toBeNull();
  });

  it("reordenar las columnas no cambia la base", () => {
    const filas: PlayerScore[] = mesa.map((_, i) => ({
      role: i === 0 ? "R" : "V", score: i, alive: true, winner: false,
    }));
    const orden = [4, 3, 2, 1, 0];
    expect(baseDeRonda(orden.map((i) => mesa[i]), orden.map((i) => filas[i]), undefined))
      .toBe(baseDeRonda(mesa, filas, undefined));
  });
});

describe("rondaAReabrir: qué modal se abre solo al recargar", () => {
  it("la ronda abierta, si su borrador vale", () => {
    expect(rondaAReabrir(conUno(), MESA, () => BASE_VACIA, T0)).toBe(2);
  });

  it("nada si se cerró, caducó o es otra mesa", () => {
    expect(rondaAReabrir(cerrado(conUno()), MESA, () => BASE_VACIA, T0)).toBeNull();
    expect(rondaAReabrir(conUno(), MESA, () => BASE_VACIA, mas(CADUCIDAD_MS + 1))).toBeNull();
    expect(rondaAReabrir(conUno(), "otra", () => BASE_VACIA, T0)).toBeNull();
  });
});

describe("ciclo de vida", () => {
  it("Submit quita el borrador de esa ronda y deja de reabrirla", () => {
    const tras = sinBorrador(conUno(), 2);
    expect(tras?.rondas["2"]).toBeUndefined();
    expect(tras?.abierta).toBeNull();
  });

  it("Cancel lo conserva: reabrir la ronda lo recupera", () => {
    expect(borradorDeRonda(cerrado(conUno()), MESA, 2, BASE_VACIA, T0)).not.toBeNull();
  });

  it("escribir con otra mesa descarta los borradores de la anterior", () => {
    const otra = firmaMesa(["A", "B", "C", "D", "E"]);
    const e = conBorrador(conUno(), otra, 1, { base: "x", ...datos }, T0);
    expect(Object.keys(e.rondas)).toEqual(["1"]);
  });

  it("sobrevive al viaje por localStorage", () => {
    const e = parsearEstado(JSON.stringify(conUno()));
    expect(borradorDeRonda(e, MESA, 2, BASE_VACIA, T0)).not.toBeNull();
  });
});

describe("parsearEstado: un borrador dudoso se tira", () => {
  it("JSON roto, otra versión o vacío dan null", () => {
    expect(parsearEstado("{roto")).toBeNull();
    expect(parsearEstado(JSON.stringify({ ...conUno(), version: 2 }))).toBeNull();
    expect(parsearEstado(null)).toBeNull();
    expect(parsearEstado("[]")).toBeNull();
  });
});
