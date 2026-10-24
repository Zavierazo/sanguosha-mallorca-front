import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsearCatalogoPersonajes } from "./personajes";
import { extraerFormatoTextoExcel } from "./excelRichText";

const arrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  return copia.buffer;
};

describe("parsearCatalogoPersonajes", () => {
  it("lee el catálogo real de characters.xlsx con el número y niveles esperados", async () => {
    const archivo = readFileSync(new URL("../../public/characters.xlsx", import.meta.url));
    const personajes = await parsearCatalogoPersonajes(arrayBuffer(archivo));

    expect(personajes).toHaveLength(1560);
    expect(personajes).toContainEqual(expect.objectContaining({
      nombre: "Cao Rui",
      nivel: 8,
      filaExcel: expect.any(Number),
    }));
    expect(personajes).toContainEqual(expect.objectContaining({
      nombre: "Ma Yunlu",
      nivel: 6.5,
      filaExcel: expect.any(Number),
    }));
    expect(personajes).toContainEqual(expect.objectContaining({
      nombre: "Lu Xun",
      dinastia: "WU",
    }));
  });

  it("lee los campos de la ficha por cabecera y conserva los saltos de línea", async () => {
    const archivo = readFileSync(new URL("../../public/characters.xlsx", import.meta.url));
    const personajes = await parsearCatalogoPersonajes(arrayBuffer(archivo));
    const personaje = personajes.find((item) => item.filaExcel === 1518);

    expect(personaje).toMatchObject({
      nombre: "Ji Miao & Ji Mu",
      nombreDorso: "吉邈吉穆",
      hp: "5",
      skills: expect.stringContaining("\n"),
      faq: "Flanking Attack: X stacks.",
      lore: expect.stringContaining("Cao Cao"),
      servidor: "HL",
      expansion: "芝兰玉树",
      version: "v. 2025-12-25",
    });
    expect(personaje?.shield).toBeNull();
    expect(personaje?.charges).toBeNull();
    expect(personaje?.additionalSkills).toBeNull();
  });

  it("preserva los fragmentos y estilos de Skills, AdditionalSkills y FAQ", async () => {
    const archivo = readFileSync(new URL("../../public/characters.xlsx", import.meta.url));
    const buffer = arrayBuffer(archivo);
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const workbook = await readXlsxFile(buffer);
    const encabezados = workbook.find(({ sheet }) => sheet === "Personajes")?.data[0] ?? [];
    const formatos = extraerFormatoTextoExcel(buffer, encabezados);
    expect(formatos.size).toBeGreaterThan(0);
    const personajes = await parsearCatalogoPersonajes(buffer);
    const skillsRich = personajes.find((personaje) => personaje.skillsRichText?.length);
    const additionalSkillsRich = personajes.find(
      (personaje) => personaje.additionalSkillsRichText?.length
    );
    const faqRich = personajes.find((personaje) => personaje.faqRichText?.length);

    expect(skillsRich?.skillsRichText?.map((fragmento) => fragmento.texto).join("")).toBe(
      skillsRich?.skills
    );
    expect(skillsRich?.skillsRichText?.some((fragmento) => fragmento.subrayado)).toBe(true);
    expect(additionalSkillsRich?.additionalSkillsRichText?.some((fragmento) => fragmento.negrita))
      .toBe(true);
    expect(
      additionalSkillsRich?.additionalSkillsRichText?.some((fragmento) => fragmento.cursiva)
    ).toBe(true);
    expect(faqRich?.faqRichText?.some((fragmento) => fragmento.subrayado)).toBe(true);
    expect(personajes.find((personaje) => personaje.filaExcel === 1518)?.loreRichText).toBeNull();

    const skillsJiMiao = personajes.find((personaje) => personaje.filaExcel === 1518)
      ?.skillsRichText;
    expect(skillsJiMiao?.[0]).toMatchObject({
      texto: "Discuss and Plan",
      subrayado: "single",
      tamanoFuentePuntos: 11,
    });
    expect(skillsJiMiao?.[1]?.tamanoFuentePuntos).toBe(
      skillsJiMiao?.[0]?.tamanoFuentePuntos
    );
  });
});
