import React, { useEffect, useState } from "react";
import {
  materialRenderers,
  materialCells,
} from "@jsonforms/material-renderers";
import { JsonForms } from "@jsonforms/react";
import PropTypes from "prop-types";
import { JsonSchema } from "@jsonforms/core";

interface RankingModalProps {
  players: string[];
  currentRound: number;
}

const RankingModal = ({ players, currentRound }: RankingModalProps) => {
  const initialData = {
    ...players.reduce(
      (acc, player) => {
        return {
          ...acc,
          [`${player}_role`]:
            players.indexOf(player) + 1 === currentRound ? "King" : null,
          [`${player}_alive`]: true,
        };
      },
      {
        winner: null,
      }
    ),
  };
  const [playersData, setPlayersData] = useState(initialData);

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

  // const dynamicDataSchema = {
  //   type: "object",
  //   properties: {
  //     loyalDeath: {
  //       type: "integer",
  //       description: "How many lions were dead when the last rebel died?",
  //     },
  //   },
  //   required: [],
  // };

  function submitModal(): void {
    console.log(playersData);
  }

  return (
    <div className="RankingModal-component">
      <JsonForms
        schema={playerRoleSchema}
        uischema={playerRoleUISchema}
        data={playersData}
        renderers={materialRenderers}
        cells={materialCells}
        onChange={({ data }) => setPlayersData(data)}
      />
      <button
        type="button"
        className="px-2 py-1 text-xs font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300"
        onClick={() => submitModal()}
      >
        Submit
      </button>
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
