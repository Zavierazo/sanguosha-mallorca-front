import React, { useEffect, useState } from "react";
import {
  materialRenderers,
  materialCells,
} from "@jsonforms/material-renderers";
import { JsonForms } from "@jsonforms/react";
import PropTypes from "prop-types";
import { JsonSchema } from "@jsonforms/core";
import { pointByNumberPlayers, PointsData, RoleConfig } from "./config";
import { ErrorObject } from "ajv";
import { GameScore, PlayerScore } from "../Ranking//Ranking";
interface RankingModalProps {
  players: string[];
  currentRound: number;
  previousPoints?: PlayerScore[];
  previousScore?: GameScore;
  handleClose: () => void;
  submitRoundData: (points: PlayerScore[], score: GameScore) => void;
}

const RankingModal = ({
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
          playerRole = playerIndex + 1 === currentRound ? "King" : null;
        }
        const playerAlive = previousPoints?.[playerIndex]?.alive;
        return {
          ...acc,
          [`${player}_role`]: playerRole,
          [`${player}_alive`]: playerAlive ?? false,
        };
      },
      {
        winner: previousScore?.winner ?? null,
      }
    ),
  };
  const [playersData, setPlayersData] = useState(initialData);
  const [playersDataValid, setPlayersDataValid] = useState(true);
  const [dynamicData, setDynamicData] = useState({
    loyalDeathOnLastRebelDeath: previousScore?.loyalDeathOnLastRebelDeath ?? 0,
    spyRebelKilled: previousScore?.spyRebelKilled ?? 0,
    spyFinalDuel: previousScore?.spyFinalDuel ?? false,
    spyFinalTrio: previousScore?.spyFinalTrio ?? false,
  });
  const [dynamicDataValid, setDynamicDataValid] = useState(true);
  const [additionalErrors, setAdditionalErrors] = useState<ErrorObject[]>([]);

  useEffect(() => {
    console.log(`RankingModal mounted`);
  }, []);

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
        type: "HorizontalLayout",
        elements: [
          {
            type: "Control",
            scope: `#/properties/winner`,
            label: "Winner?",
          },
        ],
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
              },
              {
                type: "Control",
                scope: `#/properties/${player}_alive`,
                label: "Alive?",
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
        title: "Spy reach the final duel?",
      },
      spyFinalTrio: {
        type: "boolean",
        title: "Spy reach the final trio (king + spy + rebel)?",
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
        return {
          role: roleAbbr,
          score,
          alive,
          winner:
            playersData.winner === role ||
            (playersData.winner === "King" && role === "Loyalist"),
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
      if (pointsData.rebelAlive === 0) {
        errors.push("If Rebel is the winner, at least one rebel must be alive");
      }
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
        dataPath: "/winner",
        message: message,
        schemaPath: "",
        keyword: "",
        params: {},
      };
      setAdditionalErrors((errors) => [...errors, newError]);
    });
  };

  return (
    <div className="RankingModal-component p-2">
      <div className="my-3">
        <JsonForms
          schema={playerRoleSchema}
          uischema={playerRoleUISchema}
          data={playersData}
          renderers={materialRenderers}
          cells={materialCells}
          onChange={({ errors, data }) => {
            setPlayersDataValid((errors?.length ?? 0) === 0);
            setPlayersData(data);
          }}
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
        />
      </div>
      <div className="flex flex-col justify-center text-cen gap-3 m-5">
        {additionalErrors.map((error, index) => (
          <div key={index} className="text-red-500">
            {error.message}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-5">
        <button
          type="button"
          className="px-2 py-1 text-xl font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300"
          onClick={() => submitModal()}
        >
          Submit
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xl font-medium text-center text-white bg-red-700 rounded-lg hover:bg-red-800 focus:ring-4 focus:outline-none focus:ring-red-300"
          onClick={() => handleClose()}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

RankingModal.propTypes = {
  players: PropTypes.array,
  currentRound: PropTypes.number,
};

RankingModal.defaultProps = {
  players: [],
  currentRound: 0,
};

export default RankingModal;
