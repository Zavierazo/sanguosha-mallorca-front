/**
 * El "Raw data" de la pantalla de Ranking: un texto que se lee a ojo y se
 * vuelve a cargar en la página.
 *
 * Antes era un bloque de T-SQL para pegar en SSMS. Desde que se inserta desde
 * la web ese bloque ya no lo ejecuta nadie, pero el texto sigue haciendo falta
 * para otra cosa: quien apunta la partida no siempre es organizador, y no puede
 * insertar. Ese jugador copia este texto, lo manda al grupo de Telegram, y un
 * organizador lo pega en el campo de importación y le da al botón.
 *
 * De ahí las dos exigencias del formato, que tiran en direcciones opuestas:
 *
 *   - Legible por una persona en un mensaje de Telegram. Nadie va a leer JSON
 *     en el móvil, y si el texto no se entiende no se detectan los errores
 *     antes de meterlos en la base de datos.
 *   - Parseable sin ambigüedad, y tolerante con lo que Telegram y el
 *     copiar/pegar le hacen al texto: líneas de más, la URL que el compartir
 *     añade al final, sangrías que se pierden.
 *
 * La solución es una cabecera de `Campo: valor` y filas separadas por `|` con
 * relleno para que queden en columnas. El relleno es decorativo: el parseador
 * recorta cada campo. Y cualquier línea que no encaje en ningún patrón se
 * ignora, que es lo que permite pegar el mensaje de Telegram entero.
 *
 * Nota: los nombres de jugador no pueden contener `,` ni `|`. La lista de
 * jugadores va separada por comas y las filas por barras. Ningún nombre de la
 * base de datos los tiene (son apodos), pero el selector permite teclear
 * cualquier cosa, así que `formatRawData` los rechaza en voz alta en lugar de
 * emitir un texto que no se puede volver a leer.
 */

/**
 * Versión del formato. Va escrita en la primera línea.
 *
 * Sirve para que un texto de un formato futuro no se interprete a medias con
 * las reglas de hoy: el parseador se niega en vez de adivinar. Subirla sólo
 * cuando cambie la gramática de forma incompatible.
 */
export const RAW_DATA_VERSION = 1;

/** Una fila del texto: un jugador en una ronda. */
export interface RawDataFila {
  /** `partidas.num_partida`, empezando en 1. */
  numPartida: number;
  jugador: string;
  /** La abreviatura que guarda la base de datos: R, L, V o A. */
  rol: string;
  puntos: number;
  /** `puntuaciones.ganada`. */
  gana: boolean;
  /**
   * Si el jugador sobrevivió. No se guarda en la base de datos: sólo pinta el
   * nombre en rojo y siembra el formulario de la ronda. Se conserva en el texto
   * porque, si no, reabrir una ronda importada recalcularía los puntos como si
   * no hubiera muerto nadie.
   */
  vive: boolean;
}

/** Todo lo que hace falta para reconstruir la pantalla y guardar la partida. */
export interface RawDataPartida {
  /** `YYYY-MM-DD`. */
  fecha: string;
  /** `torneo.scoring_system`: con qué reglamento se calcularon estos puntos. */
  scoringSystem: string;
  /** null es "torneo nuevo"; un número, la continuación de ese torneo. */
  torneoId: number | null;
  nivel: number;
  isRanked: boolean;
  descripcion: string;
  /** En orden de asiento. Es el orden de las columnas de la tabla. */
  jugadores: string[];
  filas: RawDataFila[];
}

export interface OpcionesParseo {
  /**
   * El `scoring_system` que emite esta pantalla. Un texto con otro sistema se
   * rechaza: sus puntos se calcularon con reglas distintas y guardarlos como si
   * fueran de este reglamento falsearía el ranking.
   */
  sistemaEsperado: string;
  /** Las opciones del desplegable de nivel (NIVELES_PARTIDA de ./niveles.ts). */
  nivelesValidos: readonly number[];
}

export type ResultadoParseo =
  | { ok: true; partida: RawDataPartida; avisos: string[] }
  | { ok: false; errores: string[]; avisos: string[] };

/** Abreviatura de la base de datos -> etiqueta que se escribe en el texto. */
const ETIQUETA_ROL: Record<string, string> = {
  R: "Rey",
  L: "Leal",
  V: "Rebelde",
  A: "Espía",
};

/**
 * Todo lo que se acepta al leer un rol, ya normalizado (sin tildes, minúsculas).
 *
 * Se aceptan la abreviatura de la base de datos, la etiqueta en castellano y el
 * nombre en inglés del formulario de la ronda, porque las tres circulan por el
 * proyecto y quien reescriba una fila a mano usará la que tenga a mano.
 */
const ROL_POR_ETIQUETA: Record<string, string> = {
  r: "R",
  rey: "R",
  king: "R",
  l: "L",
  leal: "L",
  lealista: "L",
  loyalist: "L",
  v: "V",
  rebelde: "V",
  rebel: "V",
  a: "A",
  espia: "A",
  spy: "A",
};

const etiquetaRol = (rol: string): string => ETIQUETA_ROL[rol] ?? rol;

/** Minúsculas y sin diacríticos, para comparar "Espía" con "espia". */
const normalizar = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();

/**
 * El texto que se copia y se comparte.
 *
 * `partida.filas` tiene que venir de `emparejarFilas()`: son exactamente las
 * filas que se enviarían a la base de datos, así que lo que se lee en el texto
 * y lo que se inserta no pueden discrepar.
 */
export function formatRawData(partida: RawDataPartida): string {
  const conflictivos = partida.jugadores.filter((nombre) =>
    /[,|]/.test(nombre)
  );

  const lineas: string[] = [
    `Sanguosha Mallorca · Puntuaciones (formato v${RAW_DATA_VERSION})`,
    `Fecha: ${partida.fecha}`,
    `Sistema: ${partida.scoringSystem}`,
    `Torneo: ${
      partida.torneoId === null
        ? "nuevo"
        : `${partida.torneoId} (continuación)`
    }`,
    `Nivel: ${partida.nivel}`,
    `Ranked: ${partida.isRanked ? "sí" : "no"}`,
    `Descripción: ${partida.descripcion.trim() || "-"}`,
    `Jugadores: ${partida.jugadores.join(", ")}`,
  ];

  if (conflictivos.length > 0) {
    // No se calla: un texto con estos nombres no se puede volver a leer, y
    // descubrirlo al importar, con la partida ya jugada, es tarde.
    lineas.push(
      "",
      `!! Estos nombres llevan una coma o una barra y rompen el formato: ${conflictivos.join(
        " / "
      )}. Corrígelos en el selector antes de compartir.`
    );
  }

  if (partida.filas.length === 0) {
    lineas.push("", "(sin rondas nuevas que apuntar)");
    return lineas.join("\n");
  }

  // El relleno alinea las columnas. Es decorativo: al leer se recorta cada
  // campo, así que da igual si alguien reescribe la fila sin respetarlo.
  const ancho = (valores: string[]) =>
    valores.reduce((max, valor) => Math.max(max, valor.length), 0);
  const anchoJugador = ancho(partida.filas.map((fila) => fila.jugador));
  const anchoRol = ancho(partida.filas.map((fila) => etiquetaRol(fila.rol)));
  const anchoPuntos = ancho(partida.filas.map((fila) => String(fila.puntos)));

  const rondas = Array.from(
    new Set(partida.filas.map((fila) => fila.numPartida))
  ).sort((a, b) => a - b);

  for (const ronda of rondas) {
    lineas.push("", `Ronda ${ronda}`);
    for (const fila of partida.filas.filter((f) => f.numPartida === ronda)) {
      const marcas = [fila.gana ? "gana" : null, fila.vive ? null : "muere"]
        .filter(Boolean)
        .join(", ");
      const columnas = [
        fila.jugador.padEnd(anchoJugador),
        etiquetaRol(fila.rol).padEnd(anchoRol),
        String(fila.puntos).padStart(anchoPuntos),
      ];
      if (marcas) columnas.push(marcas);
      lineas.push(`  ${columnas.join(" | ")}`);
    }
  }

  return lineas.join("\n");
}

/** `Campo: valor`, tolerando sangría, comillas de cita y negritas de Markdown. */
const CAMPO = /^[>*\s]*([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s*:\s*(.*?)[*\s]*$/;
const RONDA = /^[>*\s]*ronda\s+(\d+)/i;
const VERSION = /formato\s*v(\d+)/i;

/**
 * Los campos de la cabecera, ya normalizados.
 *
 * La lista es cerrada a propósito: una línea se trata como cabecera sólo si su
 * nombre está aquí. Si se aceptara cualquier `algo: valor`, una descripción con
 * una barra ("Descripción: liga | jornada 3") competiría con el patrón de fila,
 * y al revés, un comentario suelto de Telegram con dos puntos se colaría como
 * campo.
 */
const CAMPOS_CABECERA = new Set([
  "fecha",
  "sistema",
  "torneo",
  "nivel",
  "ranked",
  "descripcion",
  "jugadores",
]);

/**
 * Lee un Raw Data pegado y lo convierte en algo que se puede cargar y guardar.
 *
 * Devuelve errores en lugar de lanzar: al importar interesan TODOS los fallos a
 * la vez, no el primero. Los avisos no impiden cargar, sólo señalan algo raro
 * que la persona tiene que confirmar mirando la mesa.
 *
 * Ninguna línea desconocida es un error. Un mensaje reenviado por Telegram
 * llega con la URL de la web al final, con líneas de cita, y a veces con un
 * comentario de quien lo manda; nada de eso debería impedir la importación.
 */
export function parseRawData(
  texto: string,
  opciones: OpcionesParseo
): ResultadoParseo {
  const errores: string[] = [];
  const avisos: string[] = [];

  const lineas = texto.split(/\r?\n/);

  const campos = new Map<string, string>();
  const filas: RawDataFila[] = [];
  let version: number | null = null;
  let rondaActual: number | null = null;
  let filasSinRonda = 0;

  for (const linea of lineas) {
    if (version === null) {
      const marca = VERSION.exec(linea);
      if (marca) version = Number(marca[1]);
    }

    const ronda = RONDA.exec(linea);
    if (ronda) {
      rondaActual = Number(ronda[1]);
      continue;
    }

    // La cabecera se prueba primero, y sólo con los nombres conocidos, para que
    // una descripción con una barra no se confunda con una fila.
    const campo = CAMPO.exec(linea);
    if (campo && CAMPOS_CABECERA.has(normalizar(campo[1]))) {
      const clave = normalizar(campo[1]);
      // Se queda el primer valor de cada campo: si el mensaje viene citado, la
      // cabecera aparece dos veces y la de arriba es la del texto original.
      if (!campos.has(clave)) campos.set(clave, campo[2].trim());
      continue;
    }

    if (linea.includes("|")) {
      const partes = linea
        .replace(/^[>\s]*/, "")
        .split("|")
        .map((parte) => parte.trim());
      if (partes.length < 3) continue;

      const [jugador, etiqueta, puntosTexto, marcas = ""] = partes;
      const rol = ROL_POR_ETIQUETA[normalizar(etiqueta)];
      const puntos = Number(puntosTexto);

      if (!jugador || rol === undefined || !/^-?\d+$/.test(puntosTexto)) {
        // Una fila de una tabla de Markdown ("---|---") cae aquí, y también una
        // fila escrita a mano con una errata. Se avisa sólo en el segundo caso,
        // que es el que tiene un nombre reconocible delante.
        if (jugador && !/^[-\s:]*$/.test(jugador)) {
          avisos.push(`No se ha entendido la fila: "${linea.trim()}"`);
        }
        continue;
      }

      if (rondaActual === null) {
        filasSinRonda += 1;
        continue;
      }

      const normalizadas = normalizar(marcas);
      filas.push({
        numPartida: rondaActual,
        jugador,
        rol,
        puntos,
        gana: /gan|win/.test(normalizadas),
        vive: !/muer|dead/.test(normalizadas),
      });
    }
  }

  // Un mensaje reenviado con cita lleva el bloque entero dos veces. Las filas
  // idénticas se descartan sin decir nada; las que repiten jugador y ronda con
  // valores distintos sí son un conflicto, y se denuncian más abajo.
  const vistas = new Set<string>();
  const filasUnicas = filas.filter((fila) => {
    const huella = JSON.stringify(fila);
    if (vistas.has(huella)) return false;
    vistas.add(huella);
    return true;
  });
  filas.length = 0;
  filas.push(...filasUnicas);

  if (version !== null && version > RAW_DATA_VERSION) {
    return {
      ok: false,
      avisos,
      errores: [
        `Este texto es del formato v${version} y esta página entiende hasta la v${RAW_DATA_VERSION}. Actualiza la web antes de importarlo.`,
      ],
    };
  }
  if (version === null) {
    avisos.push(
      "El texto no lleva la línea de formato. Se intenta leer igual, pero comprueba los datos cargados."
    );
  }

  if (filasSinRonda > 0) {
    errores.push(
      `Hay ${filasSinRonda} fila(s) antes de la primera línea "Ronda N": no se sabe a qué ronda pertenecen.`
    );
  }

  // ----------------------------------------------------------------- cabecera
  const sistema = campos.get("sistema");
  if (sistema === undefined) {
    avisos.push(
      `El texto no dice con qué sistema de puntuación se calculó. Se dará por hecho que es ${opciones.sistemaEsperado}.`
    );
  } else if (sistema !== opciones.sistemaEsperado) {
    errores.push(
      `Los puntos se calcularon con el sistema ${sistema} y esta pantalla es la de ${opciones.sistemaEsperado}. No se pueden guardar aquí.`
    );
  }

  const fecha = campos.get("fecha") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    errores.push(
      fecha
        ? `La fecha "${fecha}" no tiene el formato AAAA-MM-DD.`
        : "Falta la fecha."
    );
  }

  const nivelTexto = campos.get("nivel") ?? "";
  const nivel = Number(nivelTexto.replace(",", "."));
  if (!nivelTexto || !Number.isFinite(nivel)) {
    errores.push("Falta el nivel de la partida, o no es un número.");
  } else if (!opciones.nivelesValidos.includes(nivel)) {
    // El nivel multiplica la experiencia de todos los jugadores de la mesa, así
    // que un valor que no está en el desplegable no se corrige en silencio.
    errores.push(
      `El nivel ${nivel} no es válido. Valores admitidos: ${opciones.nivelesValidos.join(", ")}.`
    );
  }

  const rankedTexto = normalizar(campos.get("ranked") ?? "");
  let isRanked = true;
  if (!rankedTexto) {
    avisos.push('No se indica si la partida es "ranked". Se dará por hecho que sí.');
  } else if (/^(si|s|yes|y|true|1)$/.test(rankedTexto)) {
    isRanked = true;
  } else if (/^(no|n|false|0)$/.test(rankedTexto)) {
    isRanked = false;
  } else {
    errores.push(`No se entiende "Ranked: ${campos.get("ranked")}".`);
  }

  const descripcionCruda = campos.get("descripcion") ?? "";
  const descripcion = descripcionCruda === "-" ? "" : descripcionCruda;

  const torneoTexto = campos.get("torneo") ?? "";
  let torneoId: number | null = null;
  if (torneoTexto && !/nuevo/i.test(torneoTexto)) {
    const numero = /(\d+)/.exec(torneoTexto);
    if (numero) {
      torneoId = Number(numero[1]);
    } else {
      errores.push(
        `No se entiende "Torneo: ${torneoTexto}": se esperaba "nuevo" o el número del torneo.`
      );
    }
  }

  // ---------------------------------------------------------------- jugadores
  // La lista de la cabecera es la que manda: es el orden de asiento, y de él
  // depende que continuar el torneo más adelante reordene bien la mesa. Si no
  // está, se deduce del orden de aparición en la primera ronda, que es el mismo
  // orden con el que se escribieron las filas.
  const listados = (campos.get("jugadores") ?? "")
    .split(",")
    .map((nombre) => nombre.trim())
    .filter((nombre) => nombre.length > 0);

  let jugadores = listados;
  if (jugadores.length === 0) {
    if (filas.length > 0) {
      const primera = Math.min(...filas.map((fila) => fila.numPartida));
      jugadores = Array.from(
        new Set(
          filas
            .filter((fila) => fila.numPartida === primera)
            .map((fila) => fila.jugador)
        )
      );
      avisos.push(
        `No hay línea "Jugadores": se ha tomado el orden en que aparecen en la ronda ${primera}.`
      );
    }
  }

  if (jugadores.length === 0) {
    errores.push("No se ha encontrado ningún jugador.");
  } else if (jugadores.length < 5 || jugadores.length > 10) {
    errores.push(
      `Hay ${jugadores.length} jugadores y la pantalla admite entre 5 y 10.`
    );
  }

  const duplicados = jugadores.filter(
    (nombre, indice) => jugadores.indexOf(nombre) !== indice
  );
  if (duplicados.length > 0) {
    errores.push(
      `Estos jugadores aparecen dos veces en la mesa: ${Array.from(
        new Set(duplicados)
      ).join(", ")}.`
    );
  }

  // ------------------------------------------------------------------- rondas
  if (filas.length === 0) {
    errores.push(
      'No se ha encontrado ninguna fila de puntuaciones. Cada ronda va tras una línea "Ronda N", con filas "Jugador | Rol | Puntos".'
    );
  }

  const desconocidos = Array.from(
    new Set(
      filas
        .map((fila) => fila.jugador)
        .filter((nombre) => !jugadores.includes(nombre))
    )
  );
  if (desconocidos.length > 0) {
    errores.push(
      `Estas filas son de jugadores que no están en la mesa: ${desconocidos.join(
        ", "
      )}.`
    );
  }

  const rondas = Array.from(
    new Set(filas.map((fila) => fila.numPartida))
  ).sort((a, b) => a - b);

  for (const ronda of rondas) {
    const deLaRonda = filas.filter((fila) => fila.numPartida === ronda);

    const repetidos = deLaRonda
      .map((fila) => fila.jugador)
      .filter((nombre, indice, todos) => todos.indexOf(nombre) !== indice);
    if (repetidos.length > 0) {
      errores.push(
        `En la ronda ${ronda} hay filas repetidas de: ${Array.from(
          new Set(repetidos)
        ).join(", ")}.`
      );
    }

    // Los tres avisos siguientes son cosas que la base de datos rechazaría (el
    // trigger valida la distribución de roles) o que delatan una fila perdida al
    // copiar. Se avisa y se deja continuar: quien importa tiene la mesa delante.
    if (jugadores.length > 0 && deLaRonda.length !== jugadores.length) {
      avisos.push(
        `La ronda ${ronda} tiene ${deLaRonda.length} filas y hay ${jugadores.length} jugadores.`
      );
    }
    const reyes = deLaRonda.filter((fila) => fila.rol === "R").length;
    if (reyes !== 1) {
      avisos.push(`La ronda ${ronda} tiene ${reyes} reyes; debería tener uno.`);
    }
    if (!deLaRonda.some((fila) => fila.gana)) {
      avisos.push(`En la ronda ${ronda} no gana nadie.`);
    }
  }

  if (rondas.length > 0 && rondas[0] !== 1 && torneoId === null) {
    avisos.push(
      `Las rondas empiezan en la ${rondas[0]} y el torneo es nuevo: se crearán como partidas ${rondas.join(
        ", "
      )} de un torneo sin las anteriores.`
    );
  }

  if (errores.length > 0) return { ok: false, errores, avisos };

  return {
    ok: true,
    avisos,
    partida: {
      fecha,
      scoringSystem: opciones.sistemaEsperado,
      torneoId,
      nivel,
      isRanked,
      descripcion,
      jugadores,
      filas,
    },
  };
}
