import { describe, expect, it } from "vitest";
import { buscarPersonaje, grupoDelNivel, sugerenciasPersonaje } from "./personajes";

const catalogo = [
  { nombre: "Sūn Quán", nivel: 1 },
  { nombre: "Cáo Cāo", nivel: 1 },
  { nombre: "Ma Yunlu", nivel: 6.5 },
  { nombre: "Zhang Fei", nivel: 6.5 },
  { nombre: "Ahuinan", nivel: 6.5 },
  { nombre: "Sūn Quán", nivel: 7 },
  { nombre: "Diao Chan", nivel: 7 },
  { nombre: "Diāo Chán", nivel: 7 },
  { nombre: "sūn quán", nivel: 12 },
];

describe("sugerenciasPersonaje", () => {
  it("partida de 6.5: primero del 1 al 6.5, en orden alfabético", () => {
    const op = sugerenciasPersonaje(catalogo, 6.5);
    expect(op.filter((o) => o.delNivel).map((o) => o.nombre)).toEqual([
      "Ahuinan",
      "Cáo Cāo",
      "Ma Yunlu",
      "Sūn Quán",
      "Zhang Fei",
    ]);
    expect(op.slice(0, 5).every((o) => o.delNivel)).toBe(true);
    expect(op.slice(5).every((o) => !o.delNivel)).toBe(true);
  });

  it("partida de 6: del 1 al 6, sin el 6.5", () => {
    const arriba = sugerenciasPersonaje(catalogo, 6)
      .filter((o) => o.delNivel)
      .map((o) => o.nombre);
    expect(arriba).toEqual(["Cáo Cāo", "Sūn Quán"]);
  });

  it("partida de 9: del 7 al 9, no los de 1 ni los de 12", () => {
    const op = sugerenciasPersonaje(
      [...catalogo, { nombre: "Lú Zhí", nivel: 8 }, { nombre: "Ma Teng", nivel: 12 }],
      9
    );
    const arriba = op.filter((o) => o.delNivel).map((o) => o.nombre);
    expect(arriba).toEqual(["Diao Chan", "Diāo Chán", "Lú Zhí", "Sūn Quán"]);
    expect(op.find((o) => o.nombre === "Ma Teng")?.delNivel).toBe(false);
    expect(op.find((o) => o.nombre === "Cáo Cāo")?.delNivel).toBe(false);
  });

  it("partida de 13: el tramo empieza en 13", () => {
    expect(sugerenciasPersonaje(catalogo, 13).some((o) => o.delNivel)).toBe(false);
  });

  it("etiqueta del grupo", () => {
    expect(grupoDelNivel(9)).toBe("Niveles 7 a 9");
    expect(grupoDelNivel(5)).toBe("Niveles 1 a 5");
    expect(grupoDelNivel(6.5)).toBe("Niveles 1 a 6.5");
    expect(grupoDelNivel(7)).toBe("Nivel 7");
    expect(grupoDelNivel(14)).toBe("Niveles 13 a 14");
    expect(grupoDelNivel(15)).toBe("Nivel 15");
  });

  it("un nombre en varios niveles sale una vez, con todos sus niveles", () => {
    const op = sugerenciasPersonaje(catalogo, 7);
    const sun = op.filter((o) => o.nombre.toLowerCase() === "sūn quán");
    expect(sun).toHaveLength(1);
    expect(sun[0].niveles).toEqual([1, 7, 12]);
    expect(sun[0].delNivel).toBe(true);
  });

  it("no fusiona variantes que sólo cambian en tildes", () => {
    const nombres = sugerenciasPersonaje(catalogo, 7).map((o) => o.nombre);
    expect(nombres).toContain("Diao Chan");
    expect(nombres).toContain("Diāo Chán");
  });

  it("nivel sin personajes: todo en otros niveles", () => {
    const op = sugerenciasPersonaje(catalogo, 15);
    expect(op.length).toBeGreaterThan(0);
    expect(op.every((o) => !o.delNivel)).toBe(true);
  });

  it("catálogo vacío", () => {
    expect(sugerenciasPersonaje([], 3)).toEqual([]);
  });
});

describe("buscarPersonaje", () => {
  it("devuelve la grafía del catálogo sin distinguir mayúsculas", () => {
    expect(buscarPersonaje(catalogo, "  cáo cāo ")).toBe("Cáo Cāo");
  });
  it("null si no está o viene vacío", () => {
    expect(buscarPersonaje(catalogo, "Inventado")).toBeNull();
    expect(buscarPersonaje(catalogo, "")).toBeNull();
    expect(buscarPersonaje(catalogo, null)).toBeNull();
  });
});
