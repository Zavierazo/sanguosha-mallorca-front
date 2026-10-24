import { describe, expect, it } from "vitest";
import { crearEnlacesChinos } from "./enlacesChinos";

describe("enlaces chinos del personaje", () => {
  it("genera enlaces Moegirl y Moegirl UK con el nombre chino codificado", () => {
    const enlaces = crearEnlacesChinos(" 吉邈吉穆 ", "HL");
    const nombreCodificado = encodeURIComponent("吉邈吉穆");

    expect(enlaces).toEqual([
      {
        texto: "Moegirl",
        url: `https://zh.moegirl.org.cn/%E4%B8%89%E5%9B%BD%E6%9D%80:${nombreCodificado}`,
      },
      {
        texto: "Moegirl UK",
        url: `https://moegirl.uk/%E4%B8%89%E5%9B%BD%E6%9D%80:${nombreCodificado}`,
      },
      {
        texto: "Biwiki",
        url: `https://wiki.biligame.com/sgs/${nombreCodificado}`,
      },
    ]);
  });

  it.each([
    ["HL", "sgs"],
    ["手机", "msgs"],
    ["OL", "sgsol"],
    ["欢乐杀", "hsgs"],
  ])("elige Biwiki para el servidor %s", (servidor, ruta) => {
    const enlaces = crearEnlacesChinos("测试角色", servidor);

    expect(enlaces[2]).toEqual({
      texto: "Biwiki",
      url: `https://wiki.biligame.com/${ruta}/${encodeURIComponent("测试角色")}`,
    });
  });

  it("omite Biwiki para servidores no admitidos y todos los enlaces si no hay nombre", () => {
    expect(crearEnlacesChinos("测试角色", "海外")).toHaveLength(2);
    expect(crearEnlacesChinos("  ", "HL")).toEqual([]);
    expect(crearEnlacesChinos(null, "HL")).toEqual([]);
  });
});
