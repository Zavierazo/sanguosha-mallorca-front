import { describe, expect, it } from "vitest";
import {
  formatRawData,
  parseRawData,
  RAW_DATA_VERSION,
  type OpcionesParseo,
  type RawDataFila,
  type RawDataPartida,
} from "./formatoRawData";
import { NIVELES_PARTIDA } from "./niveles";

/**
 * Tests del texto de Raw Data.
 *
 * Este formato es el camino por el que una partida apuntada por alguien que no
 * es organizador llega a la base de datos: se copia, se manda por Telegram, y un
 * organizador lo pega y lo guarda. Si el parseo falla en silencio, o interpreta
 * mal una fila, lo que se guarda no es lo que se jugó.
 *
 * Los casos no son inventados: cada uno corresponde a una regla que está
 * documentada en `formatoRawData.ts`, y sobre todo a las cosas que el texto
 * sufre de camino (líneas de cita, la URL que añade el compartir, el mensaje
 * duplicado al reenviarlo citado).
 */

const OPCIONES: OpcionesParseo = {
  sistemaEsperado: "2024-01-01",
  nivelesValidos: NIVELES_PARTIDA,
};

const JUGADORES = ["Arcan", "Miquel", "AliG", "Zatara", "Han Jin"];

const fila = (parcial: Partial<RawDataFila> = {}): RawDataFila => ({
  numPartida: 1,
  jugador: "Arcan",
  rol: "V",
  puntos: 0,
  gana: false,
  vive: true,
  ...parcial,
});

/** Una mesa de 5 con una ronda completa y distribución de roles válida. */
const partidaBase = (parcial: Partial<RawDataPartida> = {}): RawDataPartida => ({
  fecha: "2026-09-01",
  scoringSystem: "2024-01-01",
  torneoId: null,
  nivel: 5,
  isRanked: true,
  descripcion: "",
  jugadores: JUGADORES,
  filas: [
    fila({ jugador: "Arcan", rol: "R", puntos: 5, gana: true }),
    fila({ jugador: "Miquel", rol: "L", puntos: 3, gana: true }),
    fila({ jugador: "AliG", rol: "V", puntos: 0, vive: false }),
    fila({ jugador: "Zatara", rol: "V", puntos: 0, vive: false }),
    fila({ jugador: "Han Jin", rol: "A", puntos: 1 }),
  ],
  ...parcial,
});

/** Atajo: formatear y volver a leer. Es la garantía que de verdad importa. */
const ciclo = (partida: RawDataPartida) =>
  parseRawData(formatRawData(partida), OPCIONES);

/**
 * Construye un texto a mano, con la cabecera válida y el cuerpo que se le pase.
 *
 * Para los casos con filas mal escritas no sirve retocar la salida de
 * `formatRawData` con `.replace`: los nombres de los jugadores aparecen también
 * en la línea `Jugadores:`, y el reemplazo acaba tocando la cabecera en lugar de
 * la fila. Además el relleno de las columnas depende del nombre más largo de la
 * mesa, así que el texto exacto de una fila no es predecible.
 */
const conCuerpo = (cuerpo: string[]): string =>
  [
    `Sanguosha Mallorca · Puntuaciones (formato v${RAW_DATA_VERSION})`,
    "Fecha: 2026-09-01",
    "Sistema: 2024-01-01",
    "Torneo: nuevo",
    "Nivel: 5",
    "Ranked: sí",
    "Descripción: -",
    `Jugadores: ${JUGADORES.join(", ")}`,
    "",
    ...cuerpo,
  ].join("\n");

describe("ciclo completo: formatear y volver a leer", () => {
  it("devuelve exactamente los mismos datos", () => {
    const partida = partidaBase();
    const resultado = ciclo(partida);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida).toEqual(partida);
  });

  it("conserva la continuación de un torneo y sus números de ronda", () => {
    const partida = partidaBase({
      torneoId: 1009,
      filas: [
        fila({ numPartida: 3, jugador: "Arcan", rol: "R", puntos: 5, gana: true }),
        fila({ numPartida: 3, jugador: "Miquel", rol: "L", puntos: 3, gana: true }),
        fila({ numPartida: 3, jugador: "AliG", rol: "V", puntos: 0 }),
        fila({ numPartida: 3, jugador: "Zatara", rol: "V", puntos: 0 }),
        fila({ numPartida: 3, jugador: "Han Jin", rol: "A", puntos: 1 }),
      ],
    });

    const resultado = ciclo(partida);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.torneoId).toBe(1009);
    expect(resultado.partida.filas.map((f) => f.numPartida)).toEqual([
      3, 3, 3, 3, 3,
    ]);
  });

  it("conserva quién murió, que no se guarda en la base de datos", () => {
    // `vive` sólo sirve para sembrar el formulario y pintar el nombre en rojo.
    // Si se perdiera, reabrir una ronda importada recalcularía los puntos como
    // si no hubiera muerto nadie.
    const resultado = ciclo(partidaBase());

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.filas.map((f) => f.vive)).toEqual([
      true,
      true,
      false,
      false,
      true,
    ]);
  });

  it("conserva isRanked en false", () => {
    const resultado = ciclo(partidaBase({ isRanked: false }));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.isRanked).toBe(false);
  });

  it("conserva una descripción que contiene una barra", () => {
    // El peligro: la barra es el separador de las filas. La cabecera se prueba
    // antes y con una lista cerrada de campos justo para que esto no se lea
    // como una fila de puntuaciones.
    const partida = partidaBase({ descripcion: "liga | jornada 3" });
    const resultado = ciclo(partida);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.descripcion).toBe("liga | jornada 3");
    expect(resultado.partida.filas).toHaveLength(5);
  });

  it("trata la descripción vacía y el guion como lo mismo", () => {
    // formatRawData escribe "-" cuando no hay descripción, así que al leerlo
    // tiene que volver a ser cadena vacía y no un guion literal.
    expect(formatRawData(partidaBase())).toContain("Descripción: -");

    const resultado = ciclo(partidaBase({ descripcion: "   " }));
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.descripcion).toBe("");
  });

  it("conserva el nivel 6.5, que existe en los datos reales", () => {
    const resultado = ciclo(partidaBase({ nivel: 6.5 }));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.nivel).toBe(6.5);
  });
});

describe("lo que el texto sufre de camino por Telegram", () => {
  it("ignora la URL que añade el compartir", () => {
    const texto = `${formatRawData(
      partidaBase()
    )}\nhttps://sanguosha-mallorca.pages.dev/ranking`;

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.filas).toHaveLength(5);
  });

  it("ignora comentarios sueltos, aunque lleven dos puntos", () => {
    const texto = `${formatRawData(partidaBase())}\nNota: jugamos en casa de Miquel`;

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.descripcion).toBe("");
  });

  it("lee un mensaje reenviado con las líneas citadas", () => {
    const texto = formatRawData(partidaBase())
      .split("\n")
      .map((linea) => `> ${linea}`)
      .join("\n");

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.jugadores).toEqual(JUGADORES);
    expect(resultado.partida.filas).toHaveLength(5);
  });

  it("no duplica las filas cuando el bloque aparece dos veces", () => {
    // Reenviar citando deja el texto original y la cita, uno detrás del otro.
    const original = formatRawData(partidaBase());
    const citado = original
      .split("\n")
      .map((linea) => `> ${linea}`)
      .join("\n");

    const resultado = parseRawData(`${original}\n${citado}`, OPCIONES);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.filas).toHaveLength(5);
  });

  it("ignora en silencio la línea separadora de una tabla de Markdown", () => {
    const texto = formatRawData(partidaBase()).replace(
      "Ronda 1",
      "Ronda 1\n---|---|---"
    );

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.filas).toHaveLength(5);
    expect(resultado.avisos).toEqual([]);
  });

  it("avisa de una fila que no entiende, si lleva un nombre delante", () => {
    const texto = conCuerpo([
      "Ronda 1",
      "  Arcan | Rey | 5 | gana",
      "  Han Jin | Espía | tres",
    ]);

    const resultado = parseRawData(texto, OPCIONES);

    expect(
      resultado.avisos.some((aviso) => aviso.includes("No se ha entendido la fila"))
    ).toBe(true);
  });

  it("acepta las tres grafías del rol que circulan por el proyecto", () => {
    const texto = [
      `Sanguosha Mallorca · Puntuaciones (formato v${RAW_DATA_VERSION})`,
      "Fecha: 2026-09-01",
      "Sistema: 2024-01-01",
      "Torneo: nuevo",
      "Nivel: 5",
      "Ranked: sí",
      "Descripción: -",
      `Jugadores: ${JUGADORES.join(", ")}`,
      "",
      "Ronda 1",
      "  Arcan | King | 5 | gana",
      "  Miquel | Leal | 3 | gana",
      "  AliG | V | 0",
      "  Zatara | rebelde | 0",
      "  Han Jin | spy | 1",
    ].join("\n");

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.filas.map((f) => f.rol)).toEqual([
      "R",
      "L",
      "V",
      "V",
      "A",
    ]);
  });
});

describe("lo que se rechaza en vez de adivinar", () => {
  it("rechaza un texto de un formato más nuevo que esta página", () => {
    const texto = formatRawData(partidaBase()).replace(
      `formato v${RAW_DATA_VERSION}`,
      `formato v${RAW_DATA_VERSION + 1}`
    );

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.join(" ")).toContain(
      `formato v${RAW_DATA_VERSION + 1}`
    );
  });

  it("rechaza puntos calculados con otro sistema de puntuación", () => {
    // Los puntos de 2020 salen de otras reglas. Guardarlos como si fueran del
    // reglamento de 2024 falsearía el ranking sin dejar rastro.
    const texto = formatRawData(partidaBase()).replace(
      "Sistema: 2024-01-01",
      "Sistema: 2020-01-01"
    );

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.join(" ")).toContain("2020-01-01");
  });

  it("rechaza un nivel fuera del rango del desplegable", () => {
    const texto = formatRawData(partidaBase()).replace("Nivel: 5", "Nivel: 99");

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.join(" ")).toContain("99");
  });

  it("rechaza un decimal que no está en el desplegable (6.4)", () => {
    const texto = formatRawData(partidaBase()).replace("Nivel: 5", "Nivel: 6.4");

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.join(" ")).toContain("6.4");
  });

  it("rechaza una fecha con otro formato", () => {
    const texto = formatRawData(partidaBase()).replace(
      "Fecha: 2026-09-01",
      "Fecha: 01/09/2026"
    );

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.join(" ")).toContain("AAAA-MM-DD");
  });

  it("rechaza filas escritas antes de la primera línea Ronda", () => {
    const texto = [
      `Sanguosha Mallorca · Puntuaciones (formato v${RAW_DATA_VERSION})`,
      "Fecha: 2026-09-01",
      "Sistema: 2024-01-01",
      "Torneo: nuevo",
      "Nivel: 5",
      "Ranked: sí",
      "Descripción: -",
      `Jugadores: ${JUGADORES.join(", ")}`,
      "",
      "  Arcan | Rey | 5 | gana",
    ].join("\n");

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.join(" ")).toContain("Ronda N");
  });

  it("rechaza una mesa con menos de cinco jugadores", () => {
    const resultado = ciclo(
      partidaBase({
        jugadores: ["Arcan", "Miquel", "AliG"],
        filas: [
          fila({ jugador: "Arcan", rol: "R", puntos: 5, gana: true }),
          fila({ jugador: "Miquel", rol: "V", puntos: 0 }),
          fila({ jugador: "AliG", rol: "A", puntos: 1 }),
        ],
      })
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.join(" ")).toContain("entre 5 y 10");
  });

  it("rechaza un jugador repetido en la mesa", () => {
    const texto = formatRawData(partidaBase()).replace(
      `Jugadores: ${JUGADORES.join(", ")}`,
      "Jugadores: Arcan, Arcan, AliG, Zatara, Han Jin"
    );

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.join(" ")).toContain("dos veces");
  });

  it("rechaza una fila de alguien que no está en la mesa", () => {
    const texto = formatRawData(partidaBase()).replace(
      "  Han Jin",
      "  Chirimoya"
    );

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.join(" ")).toContain("Chirimoya");
  });

  it("rechaza un texto sin ninguna fila de puntuaciones", () => {
    const texto = [
      `Sanguosha Mallorca · Puntuaciones (formato v${RAW_DATA_VERSION})`,
      "Fecha: 2026-09-01",
      "Sistema: 2024-01-01",
      "Torneo: nuevo",
      "Nivel: 5",
      "Ranked: sí",
      "Descripción: -",
      `Jugadores: ${JUGADORES.join(", ")}`,
    ].join("\n");

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.join(" ")).toContain("Ronda N");
  });

  it("acumula todos los errores, no sólo el primero", () => {
    // Al importar interesan todos los fallos a la vez: quien pega el texto lo
    // corrige de una pasada en lugar de descubrirlos de uno en uno.
    const texto = formatRawData(partidaBase())
      .replace("Fecha: 2026-09-01", "Fecha: ayer")
      .replace("Nivel: 5", "Nivel: 99");

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores.length).toBeGreaterThanOrEqual(2);
  });
});

describe("avisos: cosas raras que no impiden importar", () => {
  it("avisa si falta la línea de formato", () => {
    const texto = formatRawData(partidaBase())
      .split("\n")
      .slice(1)
      .join("\n");

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(true);
    expect(
      resultado.avisos.some((aviso) => aviso.includes("no lleva la línea de formato"))
    ).toBe(true);
  });

  it("deduce el orden de asiento de la primera ronda si falta la cabecera", () => {
    // El orden importa: es el orden de asiento, y de él depende que continuar el
    // torneo más adelante reordene bien la mesa.
    const texto = formatRawData(partidaBase())
      .split("\n")
      .filter((linea) => !linea.startsWith("Jugadores:"))
      .join("\n");

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.partida.jugadores).toEqual(JUGADORES);
    expect(
      resultado.avisos.some((aviso) => aviso.includes("orden en que aparecen"))
    ).toBe(true);
  });

  it("avisa si una ronda no tiene exactamente un rey", () => {
    // Lo rechazaría el trigger de la base de datos, que valida la distribución
    // de roles contra `role_distributions`. Aquí sólo se avisa: quien importa
    // tiene la mesa delante y puede corregirlo.
    const texto = conCuerpo([
      "Ronda 1",
      "  Arcan | Rey | 5 | gana",
      "  Miquel | Rey | 3 | gana",
      "  AliG | Rebelde | 0",
      "  Zatara | Rebelde | 0",
      "  Han Jin | Espía | 1",
    ]);

    const resultado = parseRawData(texto, OPCIONES);

    expect(resultado.avisos.some((aviso) => aviso.includes("2 reyes"))).toBe(
      true
    );
  });

  it("avisa si en una ronda no gana nadie", () => {
    const partida = partidaBase({
      filas: partidaBase().filas.map((f) => ({ ...f, gana: false })),
    });

    const resultado = ciclo(partida);

    expect(
      resultado.avisos.some((aviso) => aviso.includes("no gana nadie"))
    ).toBe(true);
  });

  it("avisa si el número de filas no cuadra con el de jugadores", () => {
    const partida = partidaBase();
    const resultado = ciclo(
      partidaBase({ filas: partida.filas.slice(0, 4) })
    );

    expect(
      resultado.avisos.some((aviso) => aviso.includes("y hay 5 jugadores"))
    ).toBe(true);
  });
});

describe("formatRawData: la salida", () => {
  it("denuncia los nombres que romperían el formato", () => {
    // Ningún apodo de la base de datos lleva coma ni barra, pero el selector
    // permite teclear cualquier cosa, y un texto con esos nombres no se puede
    // volver a leer. Mejor decirlo antes de compartirlo que al importarlo.
    const texto = formatRawData(
      partidaBase({
        jugadores: ["Arcan, el grande", "Mi|quel", "AliG", "Zatara", "Han Jin"],
      })
    );

    expect(texto).toContain("rompen el formato");
    expect(texto).toContain("Arcan, el grande");
    expect(texto).toContain("Mi|quel");
  });

  it("dice que no hay nada que apuntar cuando no hay filas", () => {
    const texto = formatRawData(partidaBase({ filas: [] }));

    expect(texto).toContain("sin rondas nuevas que apuntar");
  });

  it("agrupa las filas por ronda y en orden", () => {
    const texto = formatRawData(
      partidaBase({
        filas: [
          fila({ numPartida: 2, jugador: "Arcan", rol: "R", puntos: 5 }),
          fila({ numPartida: 1, jugador: "Miquel", rol: "R", puntos: 3 }),
        ],
      })
    );

    expect(texto.indexOf("Ronda 1")).toBeLessThan(texto.indexOf("Ronda 2"));

    // Se mira sólo a partir de la primera ronda: la cabecera "Jugadores:" lleva
    // los mismos nombres, en otro orden, y falsearía la comparación.
    const cuerpo = texto.slice(texto.indexOf("Ronda 1"));
    expect(cuerpo.indexOf("Miquel")).toBeLessThan(cuerpo.indexOf("Arcan"));
  });

  it("escribe la versión del formato en la primera línea", () => {
    const primera = formatRawData(partidaBase()).split("\n")[0];

    expect(primera).toContain(`formato v${RAW_DATA_VERSION}`);
  });
});
