import React, { useEffect, useMemo, useRef, useState } from "react";
import "./RankingModal.css";
import {
  baseDeRonda,
  borradorDeRonda,
  conBorrador,
  escribirBorradores,
  firmaMesa,
  leerBorradores,
  sinBorrador,
} from "./borrador";
import {
  materialRenderers,
  materialCells,
} from "@jsonforms/material-renderers";
import { JsonForms } from "@jsonforms/react";
import { JsonSchema } from "@jsonforms/core";
import { pointByNumberPlayers, PointsData, RoleConfig } from "./config";
import { ErrorObject } from "ajv";
import { GameScore, PlayerScore } from "../Ranking//Ranking";
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

interface RankingModalProps {
  /** El catálogo, o null si no ha cargado: el campo sale deshabilitado. */
  personajes: Personaje[] | null;
  /** El nivel del desplegable: sus personajes se sugieren primero. */
  nivel: number;
  players: string[];
  currentRound: number;
  previousPoints?: PlayerScore[];
  previousScore?: GameScore;
  handleClose: () => void;
  submitRoundData: (points: PlayerScore[], score: GameScore) => void;
}

const RankingModal = ({
  personajes,
  nivel,
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

  const [playersData, setPlayersData] = useState(
    () => (borrador ? { ...initialData, ...borrador.jugadores } : initialData) as typeof initialData
  );
  // Memorizado: un objeto nuevo en cada render haría que JsonForms volviera a
  // repartir el config a todos los controles en cada pulsación.
  const configJugadores = useMemo(
    () => ({ generateId: true, personajes, nivel } satisfies ConfigPersonaje & { generateId: boolean }),
    [personajes, nivel]
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
    escribirBorradores(
      conBorrador(
        leerBorradores(),
        mesa,
        currentRound,
        { base, jugadores: playersData, dinamicos: dynamicData },
        new Date()
      )
    );
  }, [playersData, dynamicData, mesa, base, currentRound]);
  const [dynamicDataValid, setDynamicDataValid] = useState(true);
  const [additionalErrors, setAdditionalErrors] = useState<ErrorObject[]>([]);

  const playerRoleSchema = {
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
  } as JsonSchema;

  const playerRoleUISchema = {
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
  };

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
      <div className="rm-header">Ronda {currentRound}</div>
      <div className="rm-body">
        <JsonForms
          schema={playerRoleSchema}
          uischema={playerRoleUISchema}
          data={playersData}
          renderers={renderers}
          cells={materialCells}
          onChange={({ errors, data }) => {
            setPlayersDataValid((errors?.length ?? 0) === 0);
            setPlayersData(data);
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
            setDynamicData(data);
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
        <div className="flex justify-center gap-5">
          <button
            type="button"
            className="px-4 py-2 text-xl font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300"
            onClick={() => submitModal()}
          >
            Submit
          </button>
          <button
            type="button"
            className="px-4 py-2 text-xl font-medium text-center text-white bg-red-700 rounded-lg hover:bg-red-800 focus:ring-4 focus:outline-none focus:ring-red-300"
            onClick={() => handleClose()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default RankingModal;
