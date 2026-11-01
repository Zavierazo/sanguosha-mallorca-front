import { describe, expect, it } from "vitest";
import {
  calcularAvisoNivel,
  listarNombres,
  nivelAutomaticoMesa,
  valoresInicialesRonda,
} from "./datosRonda";
import type { PlayerLevel } from "../data";
import type { GameScore } from "./Ranking";

/**
 * Lo que se protege: con qué nivel y ranked nace cada ronda. Ese valor es el
 * que acaba en `partidas.nivel` si nadie lo cambia, y el nivel multiplica la
 * experiencia de toda la mesa: un error aquí se guarda sin que nada chille.
 */

const juego = (parcial: Partial<GameScore> = {}): GameScore => ({
  winner: "King",
  loyalDeathOnLastRebelDeath: 0,
  spyRebelKilled: 0,
  spyFinalDuel: false,
  spyFinalTrio: false,
  nivel: null,
  isRanked: null,
  ...parcial,
});

describe("valoresInicialesRonda", () => {
  it("una ronda ya enviada conserva sus valores", () => {
    const g = [juego({ nivel: 7, isRanked: true }), juego({ nivel: 8, isRanked: false })];
    expect(valoresInicialesRonda(g, 2, 5)).toEqual({
      nivel: 8,
      isRanked: false,
      origenNivel: "propia",
    });
  });

  it("una ronda nueva hereda de la anterior enviada más cercana", () => {
    // Ronda 1 a 7 ranked, ronda 2 subida a 8 no ranked: la 4 (con la 3 sin
    // enviar) nace en 8 no ranked, no en el automático.
    const g = [
      juego({ nivel: 7, isRanked: true }),
      juego({ nivel: 8, isRanked: false }),
      juego(),
      juego(),
    ];
    expect(valoresInicialesRonda(g, 4, 5)).toEqual({
      nivel: 8,
      isRanked: false,
      origenNivel: "anterior",
    });
  });

  it("no hereda de rondas posteriores", () => {
    const g = [juego(), juego(), juego({ nivel: 9, isRanked: false })];
    expect(valoresInicialesRonda(g, 1, 5)).toEqual({
      nivel: 5,
      isRanked: true,
      origenNivel: "automatico",
    });
  });

  it("sin nada antes: el automático y ranked", () => {
    expect(valoresInicialesRonda([], 1, 6.5)).toEqual({
      nivel: 6.5,
      isRanked: true,
      origenNivel: "automatico",
    });
  });

  it("sin automático todavía (niveles sin llegar): el mínimo", () => {
    expect(valoresInicialesRonda([], 1, null).nivel).toBe(1);
  });

  it("ignora un nivel guardado que no es una opción del desplegable", () => {
    const g = [juego({ nivel: 6.4, isRanked: true }), juego()];
    expect(valoresInicialesRonda(g, 2, 3)).toMatchObject({
      nivel: 3,
      origenNivel: "automatico",
      isRanked: true,
    });
  });

  it("resuelve nivel y ranked por separado", () => {
    // Una ronda importada de un torneo viejo puede traer is_ranked NULL.
    const g = [juego({ nivel: 4, isRanked: false }), juego({ nivel: 6, isRanked: null }), juego()];
    expect(valoresInicialesRonda(g, 3, 1)).toEqual({
      nivel: 6,
      isRanked: false,
      origenNivel: "anterior",
    });
  });
});

const nivel = (
  nombre: string,
  jugado: number | null,
  desbloqueado: number | null
): [string, PlayerLevel] => [nombre, { nombre, nivel: jugado, nivelDesbloqueado: desbloqueado }];

describe("nivelAutomaticoMesa", () => {
  it("el mínimo de la mesa, y quien no tiene nivel cuenta como 1", () => {
    const m = new Map([nivel("A", 7, 7), nivel("B", 9, 9)]);
    expect(nivelAutomaticoMesa(["A", "B"], m)).toBe(7);
    expect(nivelAutomaticoMesa(["A", "B", "Nuevo"], m)).toBe(1);
  });

  it("null mientras no han llegado los niveles", () => {
    expect(nivelAutomaticoMesa(["A"], new Map())).toBeNull();
  });
});

describe("calcularAvisoNivel", () => {
  it("avisa si el que marca el nivel ya ha desbloqueado el siguiente", () => {
    const m = new Map([nivel("A", 7, 9), nivel("B", 9, 9)]);
    expect(calcularAvisoNivel(["A", "B"], m)).toEqual({
      jugadores: ["A"],
      nivelMesa: 7,
      desbloqueado: 9,
      siguiente: 8,
    });
  });

  it("no avisa si otro empatado en el mínimo no está listo", () => {
    const m = new Map([nivel("A", 7, 9), nivel("B", 7, 7)]);
    expect(calcularAvisoNivel(["A", "B"], m)).toBeNull();
  });

  it("desde el 6.5 propone el 7, no el 7.5", () => {
    const m = new Map([nivel("A", 6.5, 10)]);
    expect(calcularAvisoNivel(["A"], m)?.siguiente).toBe(7);
  });

  it("con datos null no afirma nada", () => {
    expect(calcularAvisoNivel(["A"], new Map([nivel("A", null, 5)]))).toBeNull();
    expect(calcularAvisoNivel(["A"], new Map([nivel("A", 5, null)]))).toBeNull();
  });
});

describe("listarNombres", () => {
  it("concuerda con uno, dos y tres", () => {
    expect(listarNombres(["A"])).toBe("A");
    expect(listarNombres(["A", "B"])).toBe("A y B");
    expect(listarNombres(["A", "B", "C"])).toBe("A, B y C");
  });
});
