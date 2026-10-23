import { describe, expect, it } from "vitest";
import {
  buscarPersonaje,
  claveOpcionPersonaje,
  etiquetaOpcionPersonaje,
  filaExcelPersonajePorNivel,
  grupoDelNivel,
  reconciliarFilaPersonaje,
  sugerenciasPersonaje,
  sugerenciasPersonajeCompartidas,
} from "./personajes";

const catalogo = [
  { nombre: "Sūn Quán", nivel: 1, filaExcel: 101 },
  { nombre: "Cáo Cāo", nivel: 1, filaExcel: 102 },
  { nombre: "Ma Yunlu", nivel: 6.5, filaExcel: 103 },
  { nombre: "Zhang Fei", nivel: 6.5, filaExcel: 104 },
  { nombre: "Ahuinan", nivel: 6.5, filaExcel: 105 },
  { nombre: "Sūn Quán", nivel: 7, filaExcel: 106 },
  { nombre: "Diao Chan", nivel: 7, filaExcel: 107 },
  { nombre: "Diāo Chán", nivel: 7, filaExcel: 108 },
  { nombre: "sūn quán", nivel: 12, filaExcel: 109 },
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

  it("un nombre en varios niveles sale una vez por variante, con su fila exacta", () => {
    const op = sugerenciasPersonaje(catalogo, 7);
    const sun = op.filter((o) => o.nombre.toLowerCase() === "sūn quán");
    expect(sun.map(({ nivel, filaExcel, delNivel }) => ({ nivel, filaExcel, delNivel }))).toEqual([
      { nivel: 7, filaExcel: 106, delNivel: true },
      { nivel: 12, filaExcel: 109, delNivel: false },
      { nivel: 1, filaExcel: 101, delNivel: false },
    ]);
  });

  it("permite distinguir variantes con el mismo nombre en los niveles mostrados", () => {
    const opciones = sugerenciasPersonaje(
      [
        { nombre: "Páng Tǒng", nivel: 7, filaExcel: 701, dinastia: "Wu" },
        { nombre: "Páng Tǒng", nivel: 8, filaExcel: 801, dinastia: "Shu" },
      ],
      8
    );
    expect(opciones.map((opcion) => ({
      etiqueta: etiquetaOpcionPersonaje(opcion),
      filaExcel: opcion.filaExcel,
      dinastia: opcion.dinastia,
    }))).toEqual([
      { etiqueta: "Páng Tǒng  wgt 7, Wu", filaExcel: 701, dinastia: "Wu" },
      { etiqueta: "Páng Tǒng  wgt 8, Shu", filaExcel: 801, dinastia: "Shu" },
    ]);
  });

  it("muestra nivel y dinastía compactos y omite la dinastía vacía", () => {
    expect(etiquetaOpcionPersonaje({
      nombre: "Páng Tǒng",
      nivel: 8,
      dinastia: "Shu",
      filaExcel: 801,
      delNivel: true,
    })).toBe("Páng Tǒng  wgt 8, Shu");
    expect(etiquetaOpcionPersonaje({
      nombre: "Páng Tǒng",
      nivel: 7,
      dinastia: null,
      filaExcel: 701,
      delNivel: true,
    })).toBe("Páng Tǒng  wgt 7");
  });

  it("usa la fila Excel para distinguir opciones con la misma etiqueta", () => {
    const [primera, segunda] = sugerenciasPersonaje(
      [
        { nombre: "Cao Cao", nivel: 12, filaExcel: 1201 },
        { nombre: "Cao Cao", nivel: 12, filaExcel: 1202 },
      ],
      12
    );
    expect(etiquetaOpcionPersonaje(primera)).toBe(etiquetaOpcionPersonaje(segunda));
    expect(claveOpcionPersonaje(primera)).not.toBe(claveOpcionPersonaje(segunda));
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

  it("reutiliza la lista ordenada para todos los controles del mismo nivel", () => {
    const personajes = [{ nombre: "Páng Tǒng", nivel: 8, filaExcel: 801 }];
    expect(sugerenciasPersonajeCompartidas(personajes, 8)).toBe(
      sugerenciasPersonajeCompartidas(personajes, 8)
    );
    expect(sugerenciasPersonajeCompartidas(personajes, 8)).not.toBe(
      sugerenciasPersonajeCompartidas(personajes, 7)
    );
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

describe("filaExcelPersonajePorNivel", () => {
  const duplicados = [
    { nombre: "Bu Luanshi", nivel: 5, filaExcel: 105 },
    { nombre: "Bu Luanshi", nivel: 7, filaExcel: 207 },
    { nombre: "Bu Luanshi", nivel: 9, filaExcel: 309 },
  ];

  it("elige la fila del nivel exacto en lugar de la primera coincidencia por nombre", () => {
    expect(filaExcelPersonajePorNivel(duplicados, "Bu Luanshi", 7)).toBe(207);
  });

  it("si no hay nivel exacto, usa el nivel disponible más alto que no supere la partida", () => {
    expect(filaExcelPersonajePorNivel(duplicados, "Bu Luanshi", 8)).toBe(207);
  });

  it("si todos los niveles superan el de la partida, usa el más bajo disponible", () => {
    expect(filaExcelPersonajePorNivel(duplicados, "Bu Luanshi", 3)).toBe(105);
  });

  it("devuelve null cuando el nombre no está en el catálogo", () => {
    expect(filaExcelPersonajePorNivel(duplicados, "Desconocido", 7)).toBeNull();
  });
});

describe("reconciliarFilaPersonaje", () => {
  const personajes = [
    { nombre: "Páng Tǒng", nivel: 7, filaExcel: 701 },
    { nombre: "Páng Tǒng", nivel: 8, filaExcel: 801 },
  ];

  it("preserva la fila recién elegida mientras aún no llega el nombre del formulario", () => {
    expect(reconciliarFilaPersonaje(personajes, null, 801, 801, 8)).toBe(801);
  });

  it("preserva la selección recién hecha aunque el formulario aún tenga el nombre anterior", () => {
    expect(reconciliarFilaPersonaje(personajes, "Páng Tǒng", 801, 801, 7)).toBe(801);
  });

  it("al limpiar el selector mantiene vacío el personaje durante la actualización", () => {
    expect(reconciliarFilaPersonaje(personajes, "Páng Tǒng", null, null, 8)).toBeNull();
  });

  it("aplica el fallback cuando la fila actual no concuerda con el nombre", () => {
    expect(reconciliarFilaPersonaje(personajes, "Páng Tǒng", 999, null, 8)).toBe(801);
  });
});
