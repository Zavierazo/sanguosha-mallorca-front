import { describe, expect, it } from "vitest";
import { buildFilas, emparejarFilas } from "./crearTorneo";
import type { PlayerScore } from "../Ranking/Ranking";

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
        vive: true,
      },
      {
        num_partida: 1,
        jugador: "Miquel",
        rol: "L",
        puntos: 3,
        ganada: false,
        personaje: null,
        vive: true,
      },
      {
        num_partida: 1,
        jugador: "AliG",
        rol: "V",
        puntos: 1,
        ganada: false,
        personaje: null,
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

    const filas = buildFilas(rondas, jugadores);

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
    const payload = buildFilas(rondas, jugadores);

    expect(payload).toHaveLength(detalle.length);
    expect(payload).toEqual(
      detalle.map(({ vive, ...resto }) => {
        void vive;
        return resto;
      })
    );
  });
});

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
        puntuacion({ role: "V", personaje: "Cáo Cāo" }),
        puntuacion({ role: "R", personaje: null }),
        puntuacion({ role: "L", personaje: "Sūn Quán" }),
      ],
    ];

    expect(
      buildFilas(rondas, jugadores).map((f) => [f.jugador, f.personaje])
    ).toEqual([
      ["Arcan", "Cáo Cāo"],
      ["Miquel", null],
      ["AliG", "Sūn Quán"],
    ]);
  });

  it("vacío o sólo espacios es null, y se recorta", () => {
    const rondas: PlayerScore[][] = [
      [
        puntuacion({ personaje: "" }),
        puntuacion({ personaje: "   " }),
        puntuacion({ personaje: "  Ma Yunlu " }),
      ],
    ];

    expect(
      buildFilas(rondas, ["A", "B", "C"]).map((f) => f.personaje)
    ).toEqual([null, null, "Ma Yunlu"]);
  });

  it("los datos viejos de localStorage, sin el campo, dan null", () => {
    // Un PlayerScore guardado antes de que existiera `personaje`.
    const viejo = { role: "R", score: 3, alive: true, winner: true } as PlayerScore;

    expect(buildFilas([[viejo]], ["Arcan"])).toEqual([
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
