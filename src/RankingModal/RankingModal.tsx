import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { crearRutaMesa } from "../Mesa/mesa";
import type { AuthState } from "../supabase/useAuth";
import { avisarMesa } from "../supabase/crearTorneo";
import "./RankingModal.css";
import {
  baseDeRonda,
  borradorDeRonda,
  conBorrador,
  escribirBorradores,
  firmaMesa,
  leerBorradores,
  sinBorrador,
  type DatosRondaBorrador,
} from "./borrador";
import { esNivelPartida, NIVELES_PARTIDA } from "../Ranking/niveles";
import {
  listarNombres,
  type AvisoNivel,
  type ValoresInicialesRonda,
} from "../Ranking/datosRonda";
import { formatearNivel } from "../Ranking/formatoRawData";
import {
  materialRenderers,
  materialCells,
} from "@jsonforms/material-renderers";
import { JsonForms } from "@jsonforms/react";
import { JsonSchema } from "@jsonforms/core";
import { pointByNumberPlayers, PointsData, RoleConfig } from "./config";
import { ErrorObject } from "ajv";
import { GameScore, PlayerScore } from "../Ranking//Ranking";
import {
  filaExcelPersonajePorNivel,
  reconciliarFilaPersonaje,
  type PersonajeCatalogo,
} from "../Ranking/personajes";
import type { Personaje } from "../data";
import {
  PersonajeControl,
  personajeControlTester,
  type ConfigPersonaje,
} from "./PersonajeControl";

/** Los de material más el campo de personaje. Fuera del componente: estable. */
const renderers = [
  ...materialRenderers,
  { tester: personajeControlTester, renderer: PersonajeControl },
];

function igualesPorValor(
  actual: Record<string, unknown>,
  siguiente: Record<string, unknown>
): boolean {
  const claves = Object.keys({ ...actual, ...siguiente });
  return claves.every((clave) =>
    Object.is(actual[clave], siguiente[clave])
  );
}

interface RankingModalProps {
  /**
   * La sesión, elevada a Ranking. El botón de la mesa la usa para decidir si
   * además de copiar el enlace lo publica en el grupo de Telegram: sólo lo hace
   * un organizador identificado.
   */
  auth: AuthState;
  /** El catálogo, o null si no ha cargado: el campo sale deshabilitado. */
  personajes: Personaje[] | null;
  /**
   * Con qué nivel y ranked nace la ronda: los suyos, los de la anterior o el
   * automático (ver `valoresInicialesRonda`). Se leen una vez, al montar.
   */
  valoresIniciales: ValoresInicialesRonda;
  /**
   * El nivel automático de la mesa, o null si no ha llegado. Si la ronda nace
   * con el automático y nadie toca el desplegable, lo sigue cuando cambia.
   */
  nivelAutomatico: number | null;
  /** "Puede que hoy suba de nivel", o null. */
  avisoNivel: AvisoNivel | null;
  players: string[];
  currentRound: number;
  previousPoints?: PlayerScore[];
  previousScore?: GameScore;
  handleClose: () => void;
  submitRoundData: (points: PlayerScore[], score: GameScore) => void;
}

const RankingModal = ({
  auth,
  personajes,
  valoresIniciales,
  nivelAutomatico,
  avisoNivel,
  players,
  currentRound,
  previousPoints,
  previousScore,
  handleClose,
  submitRoundData,
}: RankingModalProps) => {
  const initialData = {
    ...players.reduce(
      (acc, player) => {
        const playerIndex = players.indexOf(player);
        const playerScoreRole = previousPoints?.[playerIndex]?.role;
        let playerRole;
        if (playerScoreRole === "R") {
          playerRole = "King";
        } else if (playerScoreRole === "L") {
          playerRole = "Loyalist";
        } else if (playerScoreRole === "V") {
          playerRole = "Rebel";
        } else if (playerScoreRole === "A") {
          playerRole = "Spy";
        } else {
          playerRole = playerIndex + 1 === currentRound ? "King" : "Rebel";
        }
        const playerAlive = previousPoints?.[playerIndex]?.alive;
        const playerPersonaje = previousPoints?.[playerIndex]?.personaje;
        return {
          ...acc,
          [`${player}_role`]: playerRole,
          [`${player}_alive`]: playerAlive ?? true,
          // undefined y no null cuando está vacío: el schema dice "string" y
          // un null haría fallar la validación de JsonForms.
          ...(playerPersonaje ? { [`${player}_personaje`]: playerPersonaje } : {}),
        };
      },
      {
        winner: previousScore?.winner ?? "King",
      }
    ),
  };
  /*
   * Borrador (ver ./borrador.ts). Se calcula UNA vez al montar: react-modal
   * desmonta el contenido al cerrarse y Ranking pasa key={currentRound}, así
   * que cada apertura de una ronda es un montaje nuevo. La base y la mesa se
   * congelan aquí a propósito: describen la ronda tal como estaba al abrirla.
   */
  const [{ mesa, base, borrador }] = useState(() => {
    const mesa = firmaMesa(players);
    const base = baseDeRonda(players, previousPoints, previousScore);
    const borrador = borradorDeRonda(leerBorradores(), mesa, currentRound, base, new Date());
    return { mesa, base, borrador };
  });

  /*
   * Nivel y ranked de ESTA ronda (van a `partidas.nivel` / `is_ranked`).
   *
   * Del borrador sólo se recupera lo que alguien tocó. Lo no tocado se vuelve
   * a heredar: entre que se escribió el borrador y ahora puede haberse enviado
   * la ronda anterior con otro nivel, y ése es el que vale.
   */
  const [datosRonda, setDatosRonda] = useState<DatosRondaBorrador>(() => {
    const b = borrador?.ronda;
    return {
      nivel: b?.nivelTocado ? b.nivel : valoresIniciales.nivel,
      nivelTocado: b?.nivelTocado ?? false,
      isRanked: b?.rankedTocado ? b.isRanked : valoresIniciales.isRanked,
      rankedTocado: b?.rankedTocado ?? false,
    };
  });
  const [origenNivel] = useState(valoresIniciales.origenNivel);
  const nivel = datosRonda.nivel;

  // Los niveles de los jugadores llegan de la base de datos después de montar
  // la página (y al recargar con el modal abierto, después de abrirlo). Si la
  // ronda nació con el automático y nadie ha tocado el desplegable, lo sigue.
  useEffect(() => {
    if (datosRonda.nivelTocado || origenNivel !== "automatico") return;
    if (nivelAutomatico === null || !esNivelPartida(nivelAutomatico)) return;
    if (datosRonda.nivel === Number(nivelAutomatico)) return;
    setDatosRonda((d) => ({ ...d, nivel: Number(nivelAutomatico) }));
  }, [datosRonda.nivel, datosRonda.nivelTocado, nivelAutomatico, origenNivel]);

  const datosIniciales = borrador
    ? { ...initialData, ...borrador.jugadores }
    : initialData;
  const [playersData, setPlayersData] = useState(
    () => datosIniciales as typeof initialData
  );
  const [filasPersonaje, setFilasPersonaje] = useState<Record<string, number | null>>(
    () => {
      const filas: Record<string, number | null> = {};
      for (let indice = 0; indice < players.length; indice += 1) {
        const player = players[indice];
        const nombre = datosIniciales[`${player}_personaje` as keyof typeof datosIniciales];
        const filaGuardada = borrador?.filasPersonaje?.[player];
        const filaGuardadaValida =
          typeof nombre === "string" &&
          personajes?.some(
            (personaje) =>
              personaje.filaExcel === filaGuardada &&
              personaje.nombre.toLowerCase() === nombre.trim().toLowerCase()
          );
        filas[player] = filaGuardadaValida
          ? filaGuardada ?? null
          : filaExcelPersonajePorNivel(
              personajes ?? [],
              typeof nombre === "string" ? nombre : null,
              nivel
            );
      }
      return filas;
    }
  );
  const filasPersonajeElegidas = useRef<Record<string, number | null>>({});
  const cambiarFilaPersonaje = useCallback((player: string, fila: number | null) => {
    filasPersonajeElegidas.current[player] = fila;
    setFilasPersonaje((actuales) => ({ ...actuales, [player]: fila }));
  }, []);
  const personajesSelector = useMemo<PersonajeCatalogo[] | null>(
    () =>
      personajes?.map(({ nombre, nivel, dinastia, filaExcel }) => ({
        nombre,
        nivel,
        dinastia,
        filaExcel,
      })) ?? null,
    [personajes]
  );
  // Memorizado: un objeto nuevo en cada render haría que JsonForms volviera a
  // repartir el config a todos los controles en cada pulsación.
  const configJugadores = useMemo(
    () => ({
      generateId: true,
      personajes: personajesSelector,
      nivel,
      filasSeleccionadas: filasPersonaje,
      onCambiarFilaSeleccionada: cambiarFilaPersonaje,
    } satisfies ConfigPersonaje & { generateId: boolean }),
    [personajesSelector, nivel, filasPersonaje, cambiarFilaPersonaje]
  );
  const [playersDataValid, setPlayersDataValid] = useState(true);
  const [dynamicData, setDynamicData] = useState(() => {
    const inicial = {
      loyalDeathOnLastRebelDeath: previousScore?.loyalDeathOnLastRebelDeath ?? 0,
      spyRebelKilled: previousScore?.spyRebelKilled ?? 0,
      spyFinalDuel: previousScore?.spyFinalDuel ?? false,
      spyFinalTrio: previousScore?.spyFinalTrio ?? false,
    };
    return (borrador ? { ...inicial, ...borrador.dinamicos } : inicial) as typeof inicial;
  });

  /*
   * El modal mide lo que de verdad se ve (ver .rm-content en RankingModal.css).
   * Firefox para Android pinta su barra encima del fondo del viewport de
   * `position: fixed`, y con `bottom: 0` el pie con Submit/Cancel quedaba
   * debajo, imposible de pulsar. visualViewport descuenta esa barra (y el
   * teclado); `offsetTop` cubre el caso en que el navegador desplaza la vista
   * al abrirse el teclado. En escritorio la media query ignora las variables.
   */
  useEffect(() => {
    const vista = window.visualViewport;
    if (!vista) return;
    const raiz = document.documentElement;
    const actualizar = () => {
      raiz.style.setProperty("--rm-alto-visible", `${vista.height}px`);
      raiz.style.setProperty("--rm-arriba-visible", `${vista.offsetTop}px`);
    };
    actualizar();
    vista.addEventListener("resize", actualizar);
    vista.addEventListener("scroll", actualizar);
    return () => {
      vista.removeEventListener("resize", actualizar);
      vista.removeEventListener("scroll", actualizar);
      raiz.style.removeProperty("--rm-alto-visible");
      raiz.style.removeProperty("--rm-arriba-visible");
    };
  }, []);

  useEffect(() => {
    if (!personajes) return;
    setFilasPersonaje((actuales) => {
      let cambio = false;
      const siguientes = { ...actuales };
      for (const player of players) {
        const nombre = playersData[`${player}_personaje` as keyof typeof playersData];
        const filaSiguiente = reconciliarFilaPersonaje(
          personajes,
          typeof nombre === "string" ? nombre : null,
          siguientes[player],
          filasPersonajeElegidas.current[player],
          nivel
        );
        if (filaSiguiente !== siguientes[player]) {
          siguientes[player] = filaSiguiente;
          cambio = true;
        }
      }
      return cambio ? siguientes : actuales;
    });
  }, [personajes, playersData, players, nivel]);

  /*
   * Cada cambio se guarda. El primer disparo (al montar, sin que nadie haya
   * tocado nada) también escribe: es lo que marca la ronda como "abierta" para
   * reabrirla si la página se recarga ahora mismo.
   *
   * `enviado` evita que, tras Submit, un último disparo vuelva a escribir el
   * borrador que submitModal acaba de borrar.
   */
  const enviado = useRef(false);
  useEffect(() => {
    if (enviado.current) return;
    const filasGuardadas: Record<string, number> = {};
    for (const player of players) {
      const fila = filasPersonaje[player];
      if (fila !== null && fila !== undefined) filasGuardadas[player] = fila;
    }
    escribirBorradores(
      conBorrador(
        leerBorradores(),
        mesa,
        currentRound,
        {
          base,
          jugadores: playersData,
          filasPersonaje: filasGuardadas,
          dinamicos: dynamicData,
          ronda: datosRonda,
        },
        new Date()
      )
    );
  }, [playersData, filasPersonaje, dynamicData, datosRonda, mesa, base, currentRound, players]);
  const [dynamicDataValid, setDynamicDataValid] = useState(true);
  const [additionalErrors, setAdditionalErrors] = useState<ErrorObject[]>([]);

  /*
   * El botón de la mesa: copia el enlace y, si eres organizador, lo publica.
   *
   * `mesaAviso` es el texto verde/rojo que sale bajo el pie; `mesaEstado` dice
   * si se está enviando al grupo, para deshabilitar el botón mientras tanto. El
   * temporizador borra el aviso solo y se cancela al desmontar (el modal se
   * desmonta al cerrarse), para no escribir estado en un componente muerto.
   */
  const [mesaAviso, setMesaAviso] = useState<string | null>(null);
  const [mesaAvisoError, setMesaAvisoError] = useState<boolean>(false);
  const [mesaEstado, setMesaEstado] = useState<"idle" | "enviando">("idle");
  const mesaTemporizador = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (mesaTemporizador.current !== null) {
        window.clearTimeout(mesaTemporizador.current);
      }
    },
    []
  );

  const avisarMesaUI = useCallback((mensaje: string, esError = false) => {
    setMesaAviso(mensaje);
    setMesaAvisoError(esError);
    if (mesaTemporizador.current !== null) {
      window.clearTimeout(mesaTemporizador.current);
    }
    // Los errores aguantan más en pantalla que los "copiado".
    mesaTemporizador.current = window.setTimeout(
      () => setMesaAviso(null),
      esError ? 8000 : 4000
    );
  }, []);

  /** El enlace a la vista de mesa con los asientos y personajes de ahora. */
  const construirEnlaceMesa = useCallback((): string => {
    const filasPersonajes = players.map((player) => filasPersonaje[player] ?? null);
    const baseUrl = new URL(
      import.meta.env.BASE_URL,
      window.location.origin
    ).toString();
    const reyes = players.filter(
      (player) =>
        playersData[`${player}_role` as keyof typeof playersData] === "King"
    );
    const rey = reyes.length === 1 ? reyes[0] : null;
    return crearRutaMesa(baseUrl, players, filasPersonajes, rey);
  }, [players, filasPersonaje, playersData]);

  /**
   * Copia el enlace al portapapeles. `navigator.clipboard` no existe fuera de un
   * contexto seguro (http:// que no sea localhost); ahí no se finge que ha ido
   * bien. Mismo patrón que RawData.tsx.
   */
  const copiarEnlace = useCallback(async (enlace: string): Promise<boolean> => {
    if (!navigator.clipboard?.writeText) return false;
    try {
      await navigator.clipboard.writeText(enlace);
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Mensaje HTML para Telegram: jugadores (rey en negrita) y el enlace en un
   * `<a href>` con el texto "Abrir la mesa".
   *
   * Telegram sólo hace clicable una URL (en `<a>` o en texto) si el host parece
   * público: en desarrollo, con `window.location.origin` = `localhost:5174`,
   * el enlace NO sale clicable, y es esperable. En producción
   * (`mallorca.sanguosha.es`) sí. Los caracteres percent-encoded de la query
   * (`%5B`, `%22`…) no son el problema; sólo lo era el host local.
   */
  const mensajeMesaTelegram = useCallback(
    (enlace: string): string => {
      const escapar = (t: string) =>
        t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const reyes = players.filter(
        (player) =>
          playersData[`${player}_role` as keyof typeof playersData] === "King"
      );
      const rey = reyes.length === 1 ? reyes[0] : null;
      const jugadores = players
        .map((player) =>
          player === rey ? `<b>${escapar(player)}</b> 👑` : escapar(player)
        )
        .join(", ");
      return (
        `🀄️ <b>Nueva mesa</b> (${players.length} jugadores)\n` +
        `${jugadores}\n` +
        `<a href="${escapar(enlace)}">Abrir la mesa</a>`
      );
    },
    [players, playersData]
  );

  /**
   * Un único botón, dos comportamientos según la sesión:
   *   - organizador identificado: copia el enlace Y lo publica en el grupo;
   *   - resto (sin sesión, sin permisos, o Supabase sin configurar): sólo copia.
   * Publicar sin ser organizador no se ofrece: la Edge Function lo rechazaría, y
   * el botón que cualquiera pudiera pulsar spamearía el grupo (era el riesgo).
   */
  const puedeEnviarMesa = auth.configured && auth.isOrganiser === true;

  const compartirMesa = useCallback(async () => {
    const enlace = construirEnlaceMesa();
    const copiado = await copiarEnlace(enlace);

    if (!puedeEnviarMesa) {
      avisarMesaUI(
        copiado
          ? "Enlace copiado al portapapeles."
          : "Este navegador no deja copiar automáticamente; copia el enlace de la barra a mano.",
        !copiado
      );
      return;
    }

    setMesaEstado("enviando");
    try {
      await avisarMesa(mensajeMesaTelegram(enlace));
      avisarMesaUI(
        copiado
          ? "Enlace copiado y enviado al grupo de Telegram."
          : "Enviado al grupo de Telegram (no se ha podido copiar al portapapeles)."
      );
    } catch (e: unknown) {
      avisarMesaUI(
        `${copiado ? "Enlace copiado, pero " : ""}no se ha podido enviar al grupo: ${
          e instanceof Error ? e.message : String(e)
        }`,
        true
      );
    } finally {
      setMesaEstado("idle");
    }
  }, [
    construirEnlaceMesa,
    copiarEnlace,
    puedeEnviarMesa,
    mensajeMesaTelegram,
    avisarMesaUI,
  ]);

  const playerRoleSchema = useMemo(() => ({
    type: "object",
    properties: players.reduce(
      (acc, player) => {
        return {
          ...acc,
          [`${player}_role`]: {
            type: "string",
            enum: ["King", "Loyalist", "Rebel", "Spy"],
          },
          [`${player}_alive`]: {
            type: "boolean",
            default: true,
          },
          // Opcional: no va en `required`.
          [`${player}_personaje`]: {
            type: "string",
          },
        };
      },
      {
        winner: {
          type: "string",
          enum: ["King", "Rebel", "Spy"],
        },
      }
    ),
    required: players.map((player) => `${player}_role`),
  } as JsonSchema), [players]);

  const playerRoleUISchema = useMemo(() => ({
    type: "VerticalLayout",
    elements: [
      {
        type: "Control",
        scope: `#/properties/winner`,
        label: "Winner?",
        options: {
         autocomplete: false,
        },
        style: {
          maxWidth: "120px",
          minWidth: "100px",
        },
      },
      ...players
        .map((player) => [
          {
            type: "Label",
            text: player,
          },
          {
            type: "HorizontalLayout",
            elements: [
              {
                type: "Control",
                scope: `#/properties/${player}_role`,
                label: "Role",
                options: {
                 autocomplete: false,
                },
                style: {
                  maxWidth: "120px",
                  minWidth: "100px",
                },
              },
              {
                type: "Control",
                scope: `#/properties/${player}_alive`,
                label: "Alive?",
              },
              {
                type: "Control",
                scope: `#/properties/${player}_personaje`,
                label: "Personaje",
                // Lo recoge personajeControlTester.
                options: { personaje: true, jugador: player },
              },
            ],
          },
        ])
        .flat(),
    ],
  }), [players]);

  let roleConfig: RoleConfig;
  const roleTable = pointByNumberPlayers[players.length];
  if (playersData.winner === "King") {
    roleConfig = roleTable.king;
  } else if (playersData.winner === "Rebel") {
    roleConfig = roleTable.rebel;
  } else {
    roleConfig = roleTable.spy;
  }

  const dynamicDataSchema = {
    type: "object",
    properties: {
      loyalDeathOnLastRebelDeath: {
        type: "integer",
        title: "How many loyalists were dead when the last rebel died?",
      },
      spyRebelKilled: {
        type: "integer",
        title: "Number of rebels killed by spy",
      },
      spyFinalDuel: {
        type: "boolean",
        title: "Spy reached the final duel?",
      },
      spyFinalTrio: {
        type: "boolean",
        title: "Spy reached the final trio (king + spy + rebel)?",
      },
    },
    required: roleConfig.required,
  };

  const dynamicDataUISchema = {
    type: "VerticalLayout",
    elements: [
      {
        type: "Label",
        text: "Additional data",
      },
      ...roleConfig.required.map((requiredField) => ({
        type: "Control",
        scope: `#/properties/${requiredField}`,
      })),
    ],
  };

  function submitModal(): void {
    setAdditionalErrors([]);
    if (!playersDataValid || !dynamicDataValid) {
      return;
    }

    const pointsData: PointsData = getPointsData();

    const errors = validate(pointsData);
    if (errors.length > 0) {
      fillAdditionalError(errors);
      return;
    }

    // La ronda pasa a playerScores: su borrador sobra. Sólo tras validar, para
    // que un Submit rechazado no pierda lo escrito.
    enviado.current = true;
    escribirBorradores(sinBorrador(leerBorradores(), currentRound));

    submitRoundData(
      players.map((player) => {
        const role = playersData[`${player}_role` as keyof typeof playersData];
        const alive = Boolean(
          playersData[`${player}_alive` as keyof typeof playersData]
        );
        let score = 0;
        if (role === "King") {
          score = roleConfig.king.points(pointsData);
        } else if (role === "Loyalist") {
          score = roleConfig.king.points(pointsData);
        } else if (role === "Rebel") {
          score = roleConfig.rebel.points(pointsData);
        } else if (role === "Spy") {
          score = roleConfig.spy.points(pointsData);
        } else {
          console.log(`Unknown role for player ${player}:${role}`);
        }
        let roleAbbr;
        if (role === "King") {
          roleAbbr = "R";
        } else if (role === "Loyalist") {
          roleAbbr = "L";
        } else if (role === "Rebel") {
          roleAbbr = "V";
        } else if (role === "Spy") {
          roleAbbr = "A";
        } else {
          roleAbbr = "?";
        }
        const personaje = (playersData as Record<string, unknown>)[
          `${player}_personaje`
        ];
        return {
          role: roleAbbr,
          score,
          alive,
          personaje:
            typeof personaje === "string" && personaje.trim()
              ? personaje.trim()
              : null,
          winner:
            playersData.winner === role ||
            (playersData.winner === "King" && role === "Loyalist"),
          imported: false,
        };
      }),
      {
        winner: playersData.winner,
        ...dynamicData,
        nivel: datosRonda.nivel,
        isRanked: datosRonda.isRanked,
      }
    );
  }

  function getPointsData(): PointsData {
    return {
      king: countByRole(["King"]),
      kingAlive: countByRoleAlive(["King"], true),
      loyalist: countByRole(["King", "Loyalist"]),
      loyalistAlive: countByRoleAlive(["King", "Loyalist"], true),
      loyalistDeath: countByRoleAlive(["King", "Loyalist"], false),
      rebel: countByRole(["Rebel"]),
      rebelAlive: countByRoleAlive(["Rebel"], true),
      rebelDeath: countByRoleAlive(["Rebel"], false),
      spy: countByRole(["Spy"]),
      spyAlive: countByRoleAlive(["Spy"], true),
      spyDeath: countByRoleAlive(["Spy"], false),
      ...dynamicData,
    };
  }

  function countByRole(roles: string[]) {
    return players.filter((player) => {
      const role = playersData[`${player}_role` as keyof typeof playersData];
      return role && roles.includes(role);
    }).length;
  }

  function countByRoleAlive(roles: string[], alive: boolean) {
    return players
      .filter((player) => {
        const role = playersData[`${player}_role` as keyof typeof playersData];
        return role && roles.includes(role);
      })
      .filter(
        (player) =>
          Boolean(
            playersData[`${player}_alive` as keyof typeof playersData]
          ) === alive
      ).length;
  }

  function validate(pointsData: PointsData): string[] {
    if (!roleTable) {
      return [];
    }
    const errors: string[] = [];
    if (pointsData.king === 0) {
      errors.push("King must be selected");
    }
    if (pointsData.spy === 0) {
      errors.push("Spy must be selected");
    }
    if (pointsData.rebel === 0) {
      errors.push("Rebel must be selected");
    }
    if (pointsData.loyalist === 0) {
      errors.push("Loyalist must be selected");
    }
    if (pointsData.king > 1) {
      errors.push("Only one king allowed");
    }
    if (pointsData.spyRebelKilled > pointsData.rebelDeath) {
      errors.push("Spy killed more rebel than rebel alive");
    }
    if (pointsData.loyalDeathOnLastRebelDeath > pointsData.loyalistDeath) {
      errors.push("Loyal dead more than loyalist alive");
    }
    if (
      pointsData.rebel < roleTable.minRebel ||
      pointsData.rebel > roleTable.maxRebel
    ) {
      errors.push(
        `Rebel must be between ${roleTable.minRebel} and ${roleTable.maxRebel}`
      );
    }
    if (
      pointsData.loyalist < roleTable.minLoyal + 1 ||
      pointsData.loyalist > roleTable.maxLoyal + 1
    ) {
      errors.push(
        `Loyalist must be between ${roleTable.minLoyal} and ${roleTable.maxLoyal}`
      );
    }
    if (
      pointsData.spy < roleTable.minSpy ||
      pointsData.spy > roleTable.maxSpy
    ) {
      errors.push(
        `Spy must be between ${roleTable.minSpy} and ${roleTable.maxSpy}`
      );
    }
    if (
      pointsData.loyalistAlive === 0 &&
      pointsData.rebelAlive === 0 &&
      pointsData.spyAlive === 0
    ) {
      errors.push("Atleast one player must be alive");
    }
    if (playersData.winner === "King") {
      if (pointsData.kingAlive === 0) {
        errors.push("If King is the winner, he must be alive");
      }
      if (pointsData.rebelAlive > 0 || pointsData.spyAlive > 0) {
        errors.push("If King is the winner, no rebel or spy must be alive");
      }
    }
    if (playersData.winner === "Rebel") {
      if (pointsData.kingAlive > 0) {
        errors.push("If Rebel is the winner, no king must be alive");
      }
    }
    if (playersData.winner === "Spy") {
      if (pointsData.spyAlive === 0) {
        errors.push("If Spy is the winner, at least one spy must be alive");
      }
      if (
        pointsData.kingAlive > 0 ||
        pointsData.rebelAlive > 0 ||
        pointsData.loyalistAlive > 0
      ) {
        errors.push(
          "If Spy is the winner, no king, rebel or loyalist must be alive"
        );
      }
    }
    return errors;
  }

  const fillAdditionalError = (message: string[]) => {
    message.forEach((message) => {
      const newError: ErrorObject = {
        instancePath: "/winner",
        message: message,
        schemaPath: "",
        keyword: "",
        params: {},
      };
      setAdditionalErrors((errors) => [...errors, newError]);
    });
  };

  return (
    <div className="RankingModal-component">
      <div className="rm-header">Partida {currentRound}</div>
      <div className="rm-body">
        {/*
          Nivel y ranked de esta partida. Antes eran uno para toda la sesión,
          en la pantalla de Ranking; en la base de datos siempre fueron de cada
          partida. El desplegable es la única fuente de `partidas.nivel`.
        */}
        <div className="rm-partida flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            Nivel de la partida
            <select
              value={nivel}
              onChange={(e) =>
                setDatosRonda((d) => ({
                  ...d,
                  nivel: Number(e.target.value),
                  nivelTocado: true,
                }))
              }
              className="rounded border border-gray-300 px-2 py-1"
            >
              {NIVELES_PARTIDA.map((n) => (
                <option key={n} value={n}>
                  {formatearNivel(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={datosRonda.isRanked}
              onChange={(e) =>
                setDatosRonda((d) => ({
                  ...d,
                  isRanked: e.target.checked,
                  rankedTocado: true,
                }))
              }
              className="h-4 w-4"
            />
            Ranked
          </label>
        </div>
        {/*
          Aviso de "puede que hoy suba de nivel". Sólo informa: quien decide es
          la persona. Desaparece en cuanto el desplegable llega al nivel
          siguiente, que es la forma de contestar "sí, hoy sube".

          role="status" y no "alert": no es un error, y el texto lleva el aviso
          escrito, no sólo el color de fondo.
        */}
        {avisoNivel !== null && nivel < avisoNivel.siguiente && (
          <p
            role="status"
            className="mt-2 rounded border border-yellow-300 bg-yellow-100 p-2 text-sm text-yellow-800"
          >
            {(() => {
              const uno = avisoNivel.jugadores.length === 1;
              return (
                `⚠️ ${listarNombres(avisoNivel.jugadores)} ${uno ? "marca" : "marcan"} ` +
                `el nivel de la mesa (${formatearNivel(avisoNivel.nivelMesa)}) y ` +
                `${uno ? "está" : "están"} al 100 % de experiencia: ` +
                `${uno ? "tiene" : "tienen"} desbloqueado al menos el nivel ` +
                `${formatearNivel(avisoNivel.desbloqueado)} sin haberlo jugado. ` +
                `Comprueba si esta partida es de nivel ${formatearNivel(avisoNivel.nivelMesa)} ` +
                `o si en ella ${uno ? "sube" : "suben"} a ` +
                `${formatearNivel(avisoNivel.siguiente)}, y ajusta el desplegable.`
              );
            })()}
          </p>
        )}
        <JsonForms
          schema={playerRoleSchema}
          uischema={playerRoleUISchema}
          data={playersData}
          renderers={renderers}
          cells={materialCells}
          onChange={({ errors, data }) => {
            setPlayersDataValid((errors?.length ?? 0) === 0);
            setPlayersData((actual) =>
              igualesPorValor(actual, data) ? actual : data
            );
          }}
          config={configJugadores}
        />
        <JsonForms
          schema={dynamicDataSchema}
          uischema={dynamicDataUISchema}
          data={dynamicData}
          renderers={materialRenderers}
          cells={materialCells}
          onChange={({ errors, data }) => {
            setDynamicDataValid((errors?.length ?? 0) === 0);
            setDynamicData((actual) =>
              igualesPorValor(actual, data) ? actual : data
            );
          }}
          config={{
            generateId: true,
          }}
        />
      </div>
      {/*
       * Los errores van en el pie y no al final del cuerpo: con 10 jugadores,
       * al final del cuerpo quedarían fuera de la pantalla en el móvil y
       * pulsar Submit parecería no hacer nada.
       */}
      <div className="rm-footer">
        {additionalErrors.length > 0 && (
          <div className="rm-errores flex flex-col gap-1 text-center" role="alert">
            {additionalErrors.map((error, index) => (
              <div key={index} className="text-red-600 text-sm">
                {error.message}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3 sm:gap-5">
          <button
            type="button"
            className="px-4 py-2 text-xl font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300"
            onClick={() => submitModal()}
          >
            Submit
          </button>
          {/*
            Un solo botón. Si eres organizador identificado, copia el enlace Y
            lo publica en el tema de mesas del grupo; si no, sólo lo copia. El
            literal lo dice, para que se vea qué va a pasar antes de pulsar.
          */}
          <button
            type="button"
            className="px-4 py-2 text-lg font-medium text-center text-white bg-sky-500 rounded-lg hover:bg-sky-600 focus:ring-4 focus:outline-none focus:ring-sky-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
            onClick={compartirMesa}
            disabled={mesaEstado === "enviando"}
            title={
              puedeEnviarMesa
                ? "Copia el enlace a esta mesa y lo publica en el grupo de Telegram"
                : "Copia el enlace a esta mesa al portapapeles"
            }
          >
            {mesaEstado === "enviando"
              ? "Enviando…"
              : puedeEnviarMesa
              ? "📋✈️ Copy & Send game link"
              : "📋 Copy game link"}
          </button>
          {/*
            Antes "Cancel", y la gente creía que perdía lo escrito. No es así:
            cada cambio ya está en el borrador (./borrador.ts), y cerrar lo
            conserva. Lo mismo el clic fuera y Escape. No valida ni calcula
            puntos: eso es Submit.
          */}
          <button
            type="button"
            className="px-4 py-2 text-xl font-medium text-center text-white bg-gray-600 rounded-lg hover:bg-gray-700 focus:ring-4 focus:outline-none focus:ring-gray-300"
            onClick={() => handleClose()}
            title="Guarda lo escrito sin apuntar la ronda; al reabrirla sigue ahí"
          >
            Save &amp; Close
          </button>
        </div>
        <div aria-live="polite">
          {mesaAviso && (
            <p
              className={
                "mt-1 text-center text-xs " +
                (mesaAvisoError ? "text-red-600" : "text-green-700")
              }
            >
              {mesaAviso}
            </p>
          )}
        </div>
        <p className="mt-1 text-center text-xs text-gray-500">
          Los cambios se guardan solos. Submit calcula los puntos y apunta la
          partida.
        </p>
      </div>
    </div>
  );
};

export default RankingModal;
