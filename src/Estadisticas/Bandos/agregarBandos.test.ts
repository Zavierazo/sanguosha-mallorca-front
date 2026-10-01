import { describe, expect, it } from "vitest";
import {
  quienGanaPorMesa,
  quienGanaTotal,
  type FilaMesa,
} from "./agregarBandos";

const mesa = (p: Partial<FilaMesa> & { num_jugadores: number }): FilaMesa => ({
  partidas: 0,
  gana_rey: 0,
  gana_rebeldes: 0,
  gana_espia: 0,
  sin_ganador: 0,
  ...p,
});

describe("Qué bando gana", () => {
  const mesas = [
    mesa({ num_jugadores: 6, partidas: 10, gana_rey: 4, gana_rebeldes: 4, gana_espia: 1, sin_ganador: 1 }),
    mesa({ num_jugadores: 5, partidas: 4, gana_rey: 2, gana_rebeldes: 1, gana_espia: 1 }),
    mesa({ num_jugadores: 4, partidas: 3, gana_rey: 3 }),
    mesa({ num_jugadores: 7, partidas: 1, sin_ganador: 1 }),
  ];

  it("deja fuera las partidas sin ganador del denominador", () => {
    const [cinco, seis] = quienGanaPorMesa(mesas);
    expect(cinco).toMatchObject({ numJugadores: 5, partidas: 4, rey: 50, rebeldes: 25, espia: 25 });
    expect(seis).toMatchObject({ numJugadores: 6, partidas: 9, sinGanador: 1, rey: 44.4 });
  });

  it("excluye las mesas de 4 y las que no tienen ninguna partida con ganador", () => {
    expect(quienGanaPorMesa(mesas).map((m) => m.numJugadores)).toEqual([5, 6]);
  });

  it("el total no cuenta las mesas de 4, ni en partidas ni en sin ganador", () => {
    const t = quienGanaTotal(mesas);
    expect(t).toMatchObject({ partidas: 13, sinGanador: 2, gana_rey: 6, gana_rebeldes: 5, gana_espia: 2 });
    expect(t.rey).toBe(46.2);
  });

  it("sin datos no divide entre cero", () => {
    expect(quienGanaTotal([])).toMatchObject({ partidas: 0, rey: 0, rebeldes: 0, espia: 0 });
  });
});
