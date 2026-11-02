import { describe, expect, it } from "vitest";
import {
  buildFilas,
  datosDePartidas,
  emparejarFilas,
  muertosDeFilas,
  personajesSinResolver,
} from "./crearTorneo";
import type { PlayerScore } from "../Ranking/Ranking";
import type { Personaje } from "../data/types";

/**
 * Tests de `emparejarFilas` y `buildFilas`.
 *
 * Lo que se protege aquí es el emparejado nombre-puntuación. Es la única
 * implementación de la que salen las tres salidas de la pantalla de Ranking (el
 * envío a la base de datos, el texto de Raw Data y el resumen de "qué se va a
 * guardar"), así que un fallo aquí sale por los tres sitios a la vez y acaba en
 * `puntuaciones` con los puntos en el jugador equivocado.
 *
 * El primer bloque es una regresión de un fallo real, descrito en el comentario
 * de `emparejarFilas`: la versión antigua filtraba y luego hacía
 * `.map((score, i) => players[i])`, con lo que `i` era el índice del array YA
 * filtrado y los nombres se desplazaban.
 */

/** Una puntuación con los valores mínimos, para no repetir el objeto entero. */
const puntuacion = (parcial: Partial<PlayerScore> = {}): PlayerScore => ({
  role: "V",
  score: 0,
  alive: true,
  winner: false,
  ...parcial,
});

describe("emparejarFilas: el emparejado nombre-puntuación", () => {
  it("asocia cada puntuación con el jugador de su misma posición", () => {
    const jugadores = ["Arcan", "Miquel", "AliG"];
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ role: "R", score: 5, winner: true }),
        puntuacion({ role: "L", score: 3 }),
        puntuacion({ role: "V", score: 1 }),
      ],
    ];

    expect(emparejarFilas(rondas, jugadores)).toEqual([
      {
        num_partida: 1,
        jugador: "Arcan",
        rol: "R",
        puntos: 5,
        ganada: true,
        personaje: null,
        filaPersonaje: null,
        vive: true,
      },
      {
        num_partida: 1,
        jugador: "Miquel",
        rol: "L",
        puntos: 3,
        ganada: false,
        personaje: null,
        filaPersonaje: null,
        vive: true,
      },
      {
        num_partida: 1,
        jugador: "AliG",
        rol: "V",
        puntos: 1,
        ganada: false,
        personaje: null,
        filaPersonaje: null,
        vive: true,
      },
    ]);
  });

  it("no desplaza los nombres cuando se descartan filas por delante", () => {
    // El caso que rompía: los dos primeros jugadores no tienen rol, así que sus
    // filas se descartan. Con el filtro antes del emparejado, los puntos de
    // "AliG" habrían acabado en "Arcan" y los de "Zatara" en "Miquel".
    const jugadores = ["Arcan", "Miquel", "AliG", "Zatara"];
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ role: null }),
        puntuacion({ role: null }),
        puntuacion({ role: "R", score: 7 }),
        puntuacion({ role: "V", score: 2 }),
      ],
    ];

    const filas = emparejarFilas(rondas, jugadores);

    expect(filas).toHaveLength(2);
    expect(filas.map((f) => [f.jugador, f.puntos])).toEqual([
      ["AliG", 7],
      ["Zatara", 2],
    ]);
  });

  it("descarta las filas importadas y mantiene alineado el resto", () => {
    // Éste es el escenario de continuar un torneo: la ronda 1 llega marcada
    // `imported` desde el torneo ya guardado y no debe reenviarse. Es también
    // donde el fallo original hacía más daño, porque se descarta una ronda
    // entera y todos los nombres se corren.
    const jugadores = ["Arcan", "Miquel", "AliG"];
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ role: "R", score: 4, imported: true }),
        puntuacion({ role: "L", score: 2, imported: true }),
        puntuacion({ role: "V", score: 1, imported: true }),
      ],
      [
        puntuacion({ role: "V", score: 6 }),
        puntuacion({ role: "R", score: 3, winner: true }),
        puntuacion({ role: "L", score: 0, alive: false }),
      ],
    ];

    const filas = emparejarFilas(rondas, jugadores);

    // Sólo la ronda 2, y con num_partida 2: el número sale del índice de la
    // ronda en la matriz, no del recuento de filas que han pasado el filtro.
    expect(filas.map((f) => f.num_partida)).toEqual([2, 2, 2]);
    expect(filas.map((f) => f.jugador)).toEqual(["Arcan", "Miquel", "AliG"]);
    expect(filas.map((f) => f.puntos)).toEqual([6, 3, 0]);
  });

  it("numera las rondas por su posición, empezando en 1", () => {
    const jugadores = ["Arcan"];
    const rondas: PlayerScore[][] = [
      [puntuacion({ score: 1 })],
      [puntuacion({ score: 2 })],
      [puntuacion({ score: 3 })],
    ];

    expect(emparejarFilas(rondas, jugadores).map((f) => f.num_partida)).toEqual([
      1, 2, 3,
    ]);
  });

  it("descarta las columnas sin jugador", () => {
    // La matriz puede tener más columnas que jugadores en la mesa: al quitar un
    // jugador del selector, las puntuaciones de esa columna siguen ahí.
    const jugadores = ["Arcan", "Miquel"];
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ score: 5 }),
        puntuacion({ score: 3 }),
        puntuacion({ score: 9 }),
      ],
    ];

    const filas = emparejarFilas(rondas, jugadores);

    expect(filas.map((f) => f.jugador)).toEqual(["Arcan", "Miquel"]);
    expect(filas.map((f) => f.puntos)).toEqual([5, 3]);
  });

  it("tolera rondas vacías y devuelve una lista vacía sin datos", () => {
    expect(emparejarFilas([], ["Arcan"])).toEqual([]);
    expect(emparejarFilas([[]], ["Arcan"])).toEqual([]);
  });

  it("guarda vive=false sólo cuando alive es explícitamente false", () => {
    const rondas: PlayerScore[][] = [
      [puntuacion({ alive: false }), puntuacion({ alive: true })],
    ];

    expect(emparejarFilas(rondas, ["Arcan", "Miquel"]).map((f) => f.vive)).toEqual(
      [false, true]
    );
  });
});

describe("buildFilas: el payload que llega a crear_torneo()", () => {
  it("emite las mismas filas que emparejarFilas pero sin la columna vive", () => {
    // `vive` no existe en la tabla `puntuaciones`. Que no se cuele en el payload
    // es el motivo de que haya dos funciones y no una.
    const jugadores = ["Arcan", "Miquel"];
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ role: "R", score: 5, winner: true, alive: false }),
        puntuacion({ role: "V", score: 2 }),
      ],
    ];

    const filas = buildFilas(rondas, jugadores, null);

    expect(filas).toEqual([
      {
        num_partida: 1,
        jugador: "Arcan",
        rol: "R",
        puntos: 5,
        ganada: true,
        personaje: null,
      },
      {
        num_partida: 1,
        jugador: "Miquel",
        rol: "V",
        puntos: 2,
        ganada: false,
        personaje: null,
      },
    ]);
    for (const fila of filas) {
      expect(fila).not.toHaveProperty("vive");
    }
  });

  it("coincide fila a fila con emparejarFilas", () => {
    // Si alguien añade un filtro a una de las dos y no a la otra, el texto que
    // se comparte por Telegram y lo que se guarda dejarían de decir lo mismo.
    const jugadores = ["Arcan", "Miquel", "AliG"];
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ role: "R", score: 4 }),
        puntuacion({ role: null }),
        puntuacion({ role: "V", score: 1, imported: true }),
      ],
      [
        puntuacion({ role: "L", score: 2 }),
        puntuacion({ role: "R", score: 8, winner: true }),
        puntuacion({ role: "A", score: 3 }),
      ],
    ];

    const detalle = emparejarFilas(rondas, jugadores);
    const payload = buildFilas(rondas, jugadores, null);

    expect(payload).toHaveLength(detalle.length);
    expect(payload).toEqual(
      detalle.map(({ vive, filaPersonaje, ...resto }) => {
        void vive;
        void filaPersonaje;
        return resto;
      })
    );
  });
});

/*
 * El personaje se elige por fila del Excel (`filaPersonaje`) y se manda como la
 * carta completa: los seis campos de `personajes_clave_key`
 * (BD/migration/pg/24_personajes_por_id.sql). Si buildFilas mandara otra cosa
 * (otro campo, '' en vez de null), crear_torneo() no casaría con la fila
 * existente y crearía una duplicada sin dar error.
 */
const catalogo: Personaje[] = [
  { filaExcel: 10, codigo: "WEI 001", servidor: "OL", expansion: "界", version: "v. 1", nombre: "Cáo Cāo", nivel: 7 },
  { filaExcel: 11, codigo: "WU 007", servidor: null, expansion: "标", version: null, nombre: "Sūn Quán", nivel: 1 },
  { filaExcel: 12, codigo: "WU 007", servidor: "HL", expansion: "标", version: null, nombre: "Sūn Quán", nivel: 12 },
];

describe("personaje: viaja con su jugador hasta el payload", () => {
  it("se empareja con el jugador correcto en un torneo continuado", () => {
    // Misma trampa que la regresión de arriba: si el personaje se emparejara
    // después de filtrar las filas importadas, acabaría en otro jugador.
    const jugadores = ["Arcan", "Miquel", "AliG"];
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ role: "R", imported: true }),
        puntuacion({ role: "L", imported: true }),
        puntuacion({ role: "V", imported: true }),
      ],
      [
        puntuacion({ role: "V", personaje: "Cáo Cāo", filaPersonaje: 10 }),
        puntuacion({ role: "R", personaje: null }),
        puntuacion({ role: "L", personaje: "Sūn Quán", filaPersonaje: 12 }),
      ],
    ];

    expect(
      buildFilas(rondas, jugadores, catalogo).map((f) => [f.jugador, f.personaje])
    ).toEqual([
      ["Arcan", { codigo: "WEI 001", servidor: "OL", expansion: "界", version: "v. 1", nombre: "Cáo Cāo", nivel: 7 }],
      ["Miquel", null],
      ["AliG", { codigo: "WU 007", servidor: "HL", expansion: "标", version: null, nombre: "Sūn Quán", nivel: 12 }],
    ]);
  });

  it("la fila decide la carta, no el nombre: mismo nombre en otra fila es otra carta", () => {
    const rondas = [[puntuacion({ personaje: "Sūn Quán", filaPersonaje: 11 })]];
    expect(buildFilas(rondas, ["A"], catalogo)[0].personaje).toEqual({
      codigo: "WU 007", servidor: null, expansion: "标", version: null, nombre: "Sūn Quán", nivel: 1,
    });
  });

  it("vacío o sólo espacios es sin personaje aunque quede una fila", () => {
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ personaje: "", filaPersonaje: 10 }),
        puntuacion({ personaje: "   ", filaPersonaje: 10 }),
      ],
    ];

    expect(buildFilas(rondas, ["A", "B"], catalogo).map((f) => f.personaje)).toEqual([null, null]);
    expect(personajesSinResolver(rondas, ["A", "B"], catalogo)).toEqual([]);
  });

  it("sin catálogo, o con una fila que no está, no se puede resolver", () => {
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ personaje: "Cáo Cāo", filaPersonaje: 10 }),
        puntuacion({ personaje: "Fantasma", filaPersonaje: 999 }),
        puntuacion({ personaje: "Sin fila" }),
      ],
    ];

    expect(personajesSinResolver(rondas, ["A", "B", "C"], catalogo)).toEqual([
      { num_partida: 1, jugador: "B", personaje: "Fantasma" },
      { num_partida: 1, jugador: "C", personaje: "Sin fila" },
    ]);
    expect(personajesSinResolver(rondas, ["A", "B", "C"], null).map((p) => p.jugador)).toEqual([
      "A", "B", "C",
    ]);
    // Y buildFilas no se inventa nada: null, que GuardarPartida no deja enviar.
    expect(buildFilas(rondas, ["A", "B", "C"], null).map((f) => f.personaje)).toEqual([
      null, null, null,
    ]);
  });

  it("los datos viejos de localStorage, sin el campo, dan null", () => {
    // Un PlayerScore guardado antes de que existiera `personaje`.
    const viejo = { role: "R", score: 3, alive: true, winner: true } as PlayerScore;

    expect(buildFilas([[viejo]], ["Arcan"], null)).toEqual([
      {
        num_partida: 1,
        jugador: "Arcan",
        rol: "R",
        puntos: 3,
        ganada: true,
        personaje: null,
      },
    ]);
  });
});

describe("datosDePartidas: la lista `partidas` del payload", () => {
  /*
   * crear_torneo() (script 23) exige una entrada de `partidas` por cada
   * num_partida de `filas`, exactamente. Si la lista saliera de todas las rondas
   * de la pantalla en vez de las filas, una ronda importada con Continue
   * Tournament se reenviaría y la base de datos rechazaría el lote entero.
   */
  const jugadores = ["Arcan", "Miquel"];

  it("sólo incluye las rondas que tienen filas, sin las importadas", () => {
    const rondas: PlayerScore[][] = [
      [puntuacion({ role: "R", imported: true }), puntuacion({ role: "V", imported: true })],
      [puntuacion({ role: "R" }), puntuacion({ role: "V" })],
      [puntuacion({ role: null }), puntuacion({ role: null })],
    ];
    const datos = [
      { nivel: 7, isRanked: true },
      { nivel: 8, isRanked: false },
      { nivel: 9, isRanked: true },
    ];

    const resultado = datosDePartidas(
      buildFilas(rondas, jugadores, null),
      (n) => datos[n - 1]
    );

    expect(resultado).toEqual({
      partidas: [{ num_partida: 2, nivel: 8, is_ranked: false }],
      incompletas: [],
    });
  });

  it("señala la ronda sin nivel o sin ranked en vez de inventárselo", () => {
    const rondas: PlayerScore[][] = [
      [puntuacion({ role: "R" })],
      [puntuacion({ role: "R" })],
      [puntuacion({ role: "R" })],
    ];
    const datos = [
      { nivel: 7, isRanked: true },
      { nivel: null, isRanked: true },
      { nivel: 7, isRanked: undefined },
    ];

    const resultado = datosDePartidas(
      buildFilas(rondas, ["Arcan"], null),
      (n) => datos[n - 1]
    );

    expect(resultado.partidas).toEqual([
      { num_partida: 1, nivel: 7, is_ranked: true },
    ]);
    expect(resultado.incompletas).toEqual([2, 3]);
  });

  it("una ronda sin datos en absoluto también es incompleta", () => {
    const resultado = datosDePartidas(
      buildFilas([[puntuacion({ role: "R" })]], ["Arcan"], null),
      () => undefined
    );

    expect(resultado).toEqual({ partidas: [], incompletas: [1] });
  });
});

describe("muertosDeFilas: los muertos para el aviso de Telegram", () => {
  /*
   * Sólo informativo (la muerte no se guarda), pero tiene que salir de las
   * MISMAS filas que el resto del aviso para no anunciar un muerto que no es.
   * emparejarFilas ya excluye las importadas y las columnas sin jugador.
   */
  it("devuelve num_partida y jugador de las filas con vive=false", () => {
    const jugadores = ["Arcan", "Miquel", "AliG"];
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ role: "R", alive: false }),
        puntuacion({ role: "V", alive: true }),
        puntuacion({ role: "A", alive: false }),
      ],
      [
        puntuacion({ role: "R", alive: true }),
        puntuacion({ role: "V", alive: false }),
        puntuacion({ role: "A", alive: true }),
      ],
    ];

    expect(muertosDeFilas(emparejarFilas(rondas, jugadores))).toEqual([
      { num_partida: 1, jugador: "Arcan" },
      { num_partida: 1, jugador: "AliG" },
      { num_partida: 2, jugador: "Miquel" },
    ]);
  });

  it("no incluye filas importadas: ya no están en emparejarFilas", () => {
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ role: "R", alive: false, imported: true }),
        puntuacion({ role: "V", alive: true }),
      ],
    ];

    expect(muertosDeFilas(emparejarFilas(rondas, ["Arcan", "Miquel"]))).toEqual(
      []
    );
  });
});
