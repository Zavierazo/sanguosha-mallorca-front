import { unzipSync } from "fflate";
import { Parser } from "saxen";
import type { PersonajeFragmentoTexto } from "./types";

const localName = (name: string) => name.split(":").pop() ?? name;

interface SharedString {
  fragments: PersonajeFragmentoTexto[];
  styledRuns: boolean[];
  formatted: boolean;
}

type FieldName = "skills" | "additionalSkills" | "faq" | "lore";

const FIELD_COLUMNS: Record<FieldName, string> = {
  skills: "Skills",
  additionalSkills: "AdditionalSkills",
  faq: "FAQ",
  lore: "LORE",
};

function parseXml(xml: string, onOpen: (name: string, attrs: Record<string, string>) => void, onClose: (name: string) => void, onText: (text: string) => void): void {
  const parser = new Parser();
  parser.on("openTag", (name, getAttributes) => onOpen(localName(name), getAttributes()));
  parser.on("closeTag", (name) => onClose(localName(name)));
  parser.on("text", (value, decodeEntities) => onText(decodeEntities(value)));
  parser.parse(xml);
}

function parseSharedStrings(
  xml: string,
  themeColors: Map<number, string>
): SharedString[] {
  const sharedStrings: SharedString[] = [];
  let fragments: PersonajeFragmentoTexto[] | null = null;
  let styledRuns: boolean[] | null = null;
  let fragment: PersonajeFragmentoTexto | null = null;
  let fragmentHasProperties = false;
  let formatted = false;
  let insideRichProperties = false;
  let textTarget: "fragment" | "plain" | null = null;
  let textBuffer = "";

  parseXml(
    xml,
    (name, attrs) => {
      if (name === "si") {
        fragments = [];
        styledRuns = [];
        fragment = null;
        formatted = false;
      } else if (name === "r" && fragments !== null) {
        fragment = { texto: "" };
        fragmentHasProperties = false;
      } else if (name === "rPr" && fragment !== null) {
        insideRichProperties = true;
        fragmentHasProperties = true;
      } else if (name === "t" && fragments !== null) {
        textTarget = fragment ? "fragment" : "plain";
        textBuffer = "";
      } else if (insideRichProperties && fragment) {
        const value = attrs.val;
        switch (name) {
          case "b":
            fragment.negrita = value !== "0" && value !== "false";
            formatted = true;
            break;
          case "i":
            fragment.cursiva = value !== "0" && value !== "false";
            formatted = true;
            break;
          case "strike":
            fragment.tachado = value !== "0" && value !== "false";
            formatted = true;
            break;
          case "u": {
            const underline = value ?? "single";
            if (underline !== "none" && underline !== "0") {
              fragment.subrayado =
                underline === "double" ||
                underline === "dotted" ||
                underline === "dashed" ||
                underline === "wavy"
                  ? underline
                  : "single";
            }
            formatted = true;
            break;
          }
          case "rFont":
            if (value) {
              fragment.familiaFuente = value;
              formatted = true;
            }
            break;
          case "color": {
            const rgb = attrs.rgb?.slice(-6);
            const theme = Number(attrs.theme);
            const color = rgb && /^[\da-f]{6}$/i.test(rgb)
              ? `#${rgb}`
              : Number.isInteger(theme)
                ? themeColors.get(theme)
                : undefined;
            if (color) {
              fragment.color = tintColor(color, attrs.tint);
              formatted = true;
            }
            break;
          }
          case "sz": {
            const size = Number(value);
            if (Number.isFinite(size) && size > 0) {
              fragment.tamanoFuentePuntos = size;
              formatted = true;
            }
            break;
          }
          case "vertAlign":
            if (value === "superscript" || value === "subscript") {
              fragment.alineacionVertical = value;
              formatted = true;
            }
            break;
        }
      }
    },
    (name) => {
      if (name === "t" && textTarget !== null) {
        if (textTarget === "fragment" && fragment) fragment.texto += textBuffer;
        if (textTarget === "plain" && fragments) {
          fragments.push({ texto: textBuffer });
          styledRuns?.push(false);
        }
        textTarget = null;
        textBuffer = "";
      } else if (name === "rPr") {
        insideRichProperties = false;
      } else if (name === "r" && fragment && fragments) {
        fragments.push(fragment);
        styledRuns?.push(fragmentHasProperties);
        fragment = null;
      } else if (name === "si" && fragments) {
        sharedStrings.push({ fragments, styledRuns: styledRuns ?? [], formatted });
        fragments = null;
        styledRuns = null;
        fragment = null;
      }
    },
    (text) => {
      if (textTarget !== null) textBuffer += text;
    }
  );

  return sharedStrings;
}

function parseThemeColors(xml: string | undefined): Map<number, string> {
  const colors = new Map<number, string>();
  if (!xml) return colors;

  const themeNames = [
    "lt1",
    "dk1",
    "lt2",
    "dk2",
    "accent1",
    "accent2",
    "accent3",
    "accent4",
    "accent5",
    "accent6",
    "hlink",
    "folHlink",
  ];
  let currentThemeIndex: number | null = null;

  parseXml(
    xml,
    (name, attrs) => {
      const themeIndex = themeNames.indexOf(name);
      if (themeIndex >= 0) currentThemeIndex = themeIndex;
      if (currentThemeIndex === null) return;
      const value = attrs.lastClr ?? attrs.val;
      if (value && /^[\da-f]{6,8}$/i.test(value)) {
        colors.set(currentThemeIndex, `#${value.slice(-6)}`);
      }
    },
    (name) => {
      if (themeNames.includes(name)) currentThemeIndex = null;
    },
    () => undefined
  );

  return colors;
}

function tintColor(color: string, tintText: string | undefined): string {
  if (!tintText) return color;
  const tint = Number(tintText);
  if (!Number.isFinite(tint) || tint < -1 || tint > 1) return color;
  const channels = color.slice(1).match(/.{2}/g);
  if (!channels) return color;
  const adjusted = channels.map((channel) => {
    const value = parseInt(channel, 16);
    const result = tint < 0 ? value * (1 + tint) : value + (255 - value) * tint;
    return Math.round(result).toString(16).padStart(2, "0");
  });
  return `#${adjusted.join("")}`;
}

function parseCellFonts(
  xml: string,
  themeColors: Map<number, string>
): Map<number, PersonajeFragmentoTexto> {
  const fonts: PersonajeFragmentoTexto[] = [];
  const styleFontIds: number[] = [];
  let inFonts = false;
  let inCellXfs = false;
  let currentFont: PersonajeFragmentoTexto | null = null;

  parseXml(
    xml,
    (name, attrs) => {
      if (name === "fonts") inFonts = true;
      else if (name === "cellXfs") inCellXfs = true;

      if (inFonts && name === "font") {
        currentFont = { texto: "" };
      } else if (inFonts && currentFont) {
        const property = name === "name" ? "rFont" : name;
        switch (property) {
          case "b":
            currentFont.negrita = attrs.val !== "0" && attrs.val !== "false";
            break;
          case "i":
            currentFont.cursiva = attrs.val !== "0" && attrs.val !== "false";
            break;
          case "strike":
            currentFont.tachado = attrs.val !== "0" && attrs.val !== "false";
            break;
          case "u": {
            const underline = attrs.val ?? "single";
            if (underline !== "none" && underline !== "0") {
              currentFont.subrayado =
                underline === "double" ||
                underline === "dotted" ||
                underline === "dashed" ||
                underline === "wavy"
                  ? underline
                  : "single";
            }
            break;
          }
          case "rFont":
            currentFont.familiaFuente = attrs.val;
            break;
          case "sz": {
            const size = Number(attrs.val);
            if (Number.isFinite(size) && size > 0) {
              currentFont.tamanoFuentePuntos = size;
            }
            break;
          }
          case "color": {
            const rgb = attrs.rgb?.slice(-6);
            const theme = Number(attrs.theme);
            const color = rgb && /^[\da-f]{6}$/i.test(rgb)
              ? `#${rgb}`
              : Number.isInteger(theme)
                ? themeColors.get(theme)
                : undefined;
            if (color) currentFont.color = tintColor(color, attrs.tint);
            break;
          }
        }
      }

      if (inCellXfs && name === "xf") {
        styleFontIds.push(Number(attrs.fontId ?? 0));
      }
    },
    (name) => {
      if (name === "font" && currentFont) {
        fonts.push(currentFont);
        currentFont = null;
      } else if (name === "fonts") {
        inFonts = false;
      } else if (name === "cellXfs") {
        inCellXfs = false;
      }
    },
    () => undefined
  );

  return new Map(
    styleFontIds.map((fontId, styleId) => [styleId, fonts[fontId] ?? { texto: "" }])
  );
}

function styledSharedString(
  sharedString: SharedString,
  defaultFont: PersonajeFragmentoTexto | undefined
): PersonajeFragmentoTexto[] | null {
  if (!sharedString.formatted) return null;
  return sharedString.fragments.map((fragment, index) =>
    sharedString.styledRuns[index]
      ? { ...fragment }
      : { ...defaultFont, ...fragment }
  );
}

function columnLetter(columnIndex: number): string {
  let value = columnIndex + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function normalizarRutaWorkbook(target: string): string {
  const parts = (target.startsWith("/") ? target.slice(1) : `xl/${target}`).split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return normalized.join("/");
}

function encontrarRutaHojaPersonajes(
  files: Record<string, Uint8Array>
): string | null {
  const workbookBytes = files["xl/workbook.xml"];
  const relationshipsBytes = files["xl/_rels/workbook.xml.rels"];
  if (!workbookBytes || !relationshipsBytes) return null;

  let relationshipId: string | null = null;
  parseXml(
    new TextDecoder().decode(workbookBytes),
    (name, attrs) => {
      if (name === "sheet" && attrs.name === "Personajes") {
        relationshipId = attrs["r:id"] ?? attrs.id ?? null;
      }
    },
    () => undefined,
    () => undefined
  );
  if (!relationshipId) return null;

  let target: string | null = null;
  parseXml(
    new TextDecoder().decode(relationshipsBytes),
    (name, attrs) => {
      if (name === "Relationship" && attrs.Id === relationshipId) {
        target = attrs.Target ?? null;
      }
    },
    () => undefined,
    () => undefined
  );
  return target ? normalizarRutaWorkbook(target) : null;
}

export function extraerFormatoTextoExcel(
  archivo: ArrayBuffer,
  encabezados: unknown[]
): Map<number, Partial<Record<FieldName, PersonajeFragmentoTexto[]>>> {
  const files = unzipSync(new Uint8Array(archivo));
  const sharedStringsBytes = files["xl/sharedStrings.xml"];
  const stylesBytes = files["xl/styles.xml"];
  const sheetPath = encontrarRutaHojaPersonajes(files);
  const sheetBytes = sheetPath ? files[sheetPath] : undefined;
  if (!sharedStringsBytes || !stylesBytes || !sheetBytes) {
    throw new Error("No se pudo leer el texto enriquecido de characters.xlsx.");
  }

  const fieldsByColumn = new Map<string, FieldName>();
  for (const [field, header] of Object.entries(FIELD_COLUMNS) as [FieldName, string][]) {
    const columnIndex = encabezados.indexOf(header);
    if (columnIndex >= 0) fieldsByColumn.set(columnLetter(columnIndex), field);
  }
  const themeColors = parseThemeColors(
    files["xl/theme/theme1.xml"]
      ? new TextDecoder().decode(files["xl/theme/theme1.xml"])
      : undefined
  );
  const sharedStrings = parseSharedStrings(
    new TextDecoder().decode(sharedStringsBytes),
    themeColors
  );
  const cellFonts = parseCellFonts(new TextDecoder().decode(stylesBytes), themeColors);
  const formattedByRow = new Map<
    number,
    Partial<Record<FieldName, PersonajeFragmentoTexto[]>>
  >();
  let cell: {
    row: number;
    field: FieldName;
    type: string;
    value: string;
    styleId: number;
  } | null = null;
  let readingValue = false;

  parseXml(
    new TextDecoder().decode(sheetBytes),
    (name, attrs) => {
      if (name === "c" && attrs.r) {
        const match = /^([A-Z]+)(\d+)$/i.exec(attrs.r);
        const field = match ? fieldsByColumn.get(match[1].toUpperCase()) : undefined;
        if (match && field) {
          cell = {
            row: Number(match[2]),
            field,
            type: attrs.t ?? "",
            value: "",
            styleId: Number(attrs.s ?? 0),
          };
        }
      } else if (name === "v" && cell) {
        readingValue = true;
      }
    },
    (name) => {
      if (name === "v") readingValue = false;
      if (name === "c" && cell) {
        const sharedIndex = Number(cell.value);
        const sharedString = sharedStrings[sharedIndex];
        const textRuns =
          cell.type === "s" && sharedString
            ? styledSharedString(sharedString, cellFonts.get(cell.styleId))
            : null;
        if (textRuns) {
          const fields = formattedByRow.get(cell.row) ?? {};
          fields[cell.field] = textRuns;
          formattedByRow.set(cell.row, fields);
        }
        cell = null;
      }
    },
    (text) => {
      if (readingValue && cell) cell.value += text;
    }
  );

  return formattedByRow;
}
