import readXlsxFile from "read-excel-file/browser";
import type { Personaje, PersonajeFragmentoTexto } from "./types";
import { extraerFormatoTextoExcel } from "./excelRichText";

const NIVELES_VALIDOS = new Set([
  ...Array.from({ length: 15 }, (_, indice) => indice + 1),
  6.5,
]);
const NIVELES_REMAPEADOS = new Map([
  [6.4, 6.5],
  [7.4, 8],
]);

/** Convierte la hoja `Personajes` del Excel público al catálogo del selector. */
export async function parsearCatalogoPersonajes(
  archivo: ArrayBuffer
): Promise<Personaje[]> {
  const hojas = await readXlsxFile(archivo);
  const hoja = hojas.find(({ sheet }) => sheet === "Personajes");
  if (!hoja) {
    throw new Error('El archivo characters.xlsx no contiene la hoja "Personajes".');
  }

  const encabezados = hoja.data[0] ?? [];
  const columnaNombre = encabezados.indexOf("Nombre");
  const columnaNivel = encabezados.indexOf("Nivel");
  if (columnaNombre < 0 || columnaNivel < 0) {
    throw new Error('La hoja "Personajes" debe tener las columnas "Nombre" y "Nivel".');
  }
  const columnasFicha = {
    hp: encabezados.indexOf("HP"),
    shield: encabezados.indexOf("Shield"),
    charges: encabezados.indexOf("charge"),
    skills: encabezados.indexOf("Skills"),
    additionalSkills: encabezados.indexOf("AdditionalSkills"),
    faq: encabezados.indexOf("FAQ"),
    lore: encabezados.indexOf("LORE"),
    servidor: encabezados.indexOf("Servidor"),
    expansion: encabezados.indexOf("Expansión"),
    version: encabezados.indexOf("Version"),
    dinastia: encabezados.indexOf("Dinastia (*)"),
  } as const;
  const faltanColumnasFicha = Object.entries(columnasFicha)
    .filter(([, indice]) => indice < 0)
    .map(([campo]) => campo);
  if (faltanColumnasFicha.length > 0) {
    throw new Error(
      `Faltan columnas de ficha en characters.xlsx: ${faltanColumnasFicha.join(", ")}.`
    );
  }
  const formatoPorFila = extraerFormatoTextoExcel(archivo, encabezados);

  const personajes: Personaje[] = [];
  const filas = hoja.data.slice(1);
  for (let indice = 0; indice < filas.length; indice += 1) {
    const fila = filas[indice];
    const nombre = fila[columnaNombre];
    if (nombre == null || nombre === "") continue;
    if (typeof nombre !== "string" || !nombre.trim()) {
      throw new Error(`Nombre inválido en la fila ${indice + 2} de characters.xlsx.`);
    }

    const nivelCrudo = fila[columnaNivel];
    // Sin nivel asignado no se puede ofrecer en un selector que muestra los
    // niveles del personaje y la base de datos tampoco admite esa fila.
    if (
      nivelCrudo == null ||
      nivelCrudo === "" ||
      (typeof nivelCrudo === "string" && !nivelCrudo.trim())
    ) {
      continue;
    }

    const nivelNumerico =
      typeof nivelCrudo === "number"
        ? nivelCrudo
        : typeof nivelCrudo === "string"
          ? Number(nivelCrudo.trim())
          : Number.NaN;
    if (!Number.isFinite(nivelNumerico)) {
      throw new Error(`Nivel inválido en la fila ${indice + 2} de characters.xlsx.`);
    }

    const nivel = NIVELES_REMAPEADOS.get(nivelNumerico) ?? nivelNumerico;
    if (!NIVELES_VALIDOS.has(nivel)) {
      throw new Error(
        `Nivel ${nivelNumerico} no admitido en la fila ${indice + 2} de characters.xlsx.`
      );
    }
    const textoCelda = (columna: number): string | null => {
      const valor = fila[columna];
      if (valor == null || valor === "") return null;
      return String(valor).trim() || null;
    };

    const formato = formatoPorFila.get(indice + 2);
    const formatoValido = (
      valor: PersonajeFragmentoTexto[] | undefined,
      texto: string | null
    ) => {
      if (!valor || texto === null) return null;

      const textoCompleto = valor.map((fragmento) => fragmento.texto).join("");
      const inicio = textoCompleto.length - textoCompleto.trimStart().length;
      const fin = textoCompleto.trimEnd().length;
      let posicion = 0;
      const fragmentosRecortados: PersonajeFragmentoTexto[] = [];
      for (const fragmento of valor) {
        const siguientePosicion = posicion + fragmento.texto.length;
        const inicioFragmento = Math.max(posicion, inicio);
        const finFragmento = Math.min(siguientePosicion, fin);
        const textoFragmento = fragmento.texto.slice(
          inicioFragmento - posicion,
          finFragmento - posicion
        );
        posicion = siguientePosicion;
        if (textoFragmento) {
          fragmentosRecortados.push({ ...fragmento, texto: textoFragmento });
        }
      }

      return fragmentosRecortados.map((fragmento) => fragmento.texto).join("") === texto
        ? fragmentosRecortados
        : null;
    };

    const skills = textoCelda(columnasFicha.skills);
    const additionalSkills = textoCelda(columnasFicha.additionalSkills);
    const faq = textoCelda(columnasFicha.faq);
    const lore = textoCelda(columnasFicha.lore);

    personajes.push({
      nombre: nombre.trim(),
      nivel,
      dinastia: textoCelda(columnasFicha.dinastia),
      filaExcel: indice + 2,
      hp: textoCelda(columnasFicha.hp),
      shield: textoCelda(columnasFicha.shield),
      charges: textoCelda(columnasFicha.charges),
      skills,
      additionalSkills,
      faq,
      lore,
      servidor: textoCelda(columnasFicha.servidor),
      expansion: textoCelda(columnasFicha.expansion),
      version: textoCelda(columnasFicha.version),
      skillsRichText: formatoValido(formato?.skills, skills),
      additionalSkillsRichText: formatoValido(formato?.additionalSkills, additionalSkills),
      faqRichText: formatoValido(formato?.faq, faq),
      loreRichText: formatoValido(formato?.lore, lore),
    });
  }

  return personajes;
}

export async function cargarPersonajes(): Promise<Personaje[]> {
  const respuesta = await fetch(`${import.meta.env.BASE_URL}characters.xlsx`);
  if (!respuesta.ok) {
    throw new Error(`No se pudo cargar characters.xlsx (HTTP ${respuesta.status}).`);
  }
  return parsearCatalogoPersonajes(await respuesta.arrayBuffer());
}
