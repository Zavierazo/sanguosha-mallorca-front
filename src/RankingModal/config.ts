export interface PointsData {
  //Mandatory
  king: number;
  kingAlive: number;
  loyalist: number;
  loyalistAlive: number;
  loyalistDeath: number;
  rebel: number;
  rebelAlive: number;
  rebelDeath: number;
  spy: number;
  spyAlive: number;
  spyDeath: number;
  //On demand
  loyalDeathOnLastRebelDeath: number; // Number of Loyal dead when the last rebel died
  spyRebelKilled: number; // Number of Rebel killed by Spy
  spyFinalDuel: boolean; // Whether the reach the final duel
  spyFinalTrio: boolean; // Whether the reach the final trio(king + spy + rebel)
}

export interface IPointsMap {
  [key: number]: {
    king: RoleConfig;
    rebel: RoleConfig;
    spy: RoleConfig;
    minRebel: number;
    maxRebel: number;
    minLoyal: number;
    maxLoyal: number;
    minSpy: number;
    maxSpy: number;
  };
}
export interface RoleConfig {
  king: RolePoints;
  rebel: RolePoints;
  spy: RolePoints;
  required: string[];
}
export interface RolePoints {
  points: (data: PointsData) => number;
}

export const pointByNumberPlayers: IPointsMap = {
  5: {
    minRebel: 2,
    maxRebel: 2,
    minLoyal: 1,
    maxLoyal: 1,
    minSpy: 1,
    maxSpy: 1,
    king: {
      king: {
        points: ({ loyalistAlive }: PointsData) =>
          loyalistAlive === 2 ? 48 : 42,
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 9,
      },
      spy: {
        points: ({ loyalistDeath, spyFinalDuel }: PointsData) =>
          6 + 4 * loyalistDeath + (spyFinalDuel ? 10 : 0),
      },
      required: ["loyalDeathOnLastRebelDeath", "spyFinalDuel"],
    },
    rebel: {
      king: {
        points: ({ rebelDeath }: PointsData) => rebelDeath * 5,
      },
      rebel: {
        points: ({ rebelAlive }: PointsData) => (rebelAlive === 2 ? 49 : 45),
      },
      spy: {
        points: ({ spyRebelKilled, spyFinalTrio }: PointsData) =>
          6 + 5 * spyRebelKilled + (spyFinalTrio ? 10 : 0),
      },
      required: ["spyFinalTrio", "spyRebelKilled"],
    },
    spy: {
      king: {
        points: () => 16,
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 9,
      },
      spy: {
        points: () => 75,
      },
      required: ["loyalDeathOnLastRebelDeath"],
    },
  },
  6: {
    minRebel: 3,
    maxRebel: 3,
    minLoyal: 1,
    maxLoyal: 1,
    minSpy: 1,
    maxSpy: 1,
    king: {
      king: {
        points: ({ loyalistAlive }: PointsData) =>
          loyalistAlive === 2 ? 54 : 48,
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 9,
      },
      spy: {
        points: ({ loyalistDeath, spyFinalDuel }: PointsData) =>
          8 + 4 * loyalistDeath + (spyFinalDuel ? 14 : 0),
      },
      required: ["loyalDeathOnLastRebelDeath", "spyFinalDuel"],
    },
    rebel: {
      king: {
        points: ({ rebelDeath }: PointsData) => rebelDeath * 5,
      },
      rebel: {
        points: ({ rebelAlive }: PointsData) => {
          if (rebelAlive === 3) {
            return 49;
          } else if (rebelAlive === 2) {
            return 45;
          } else {
            return 41;
          }
        },
      },
      spy: {
        points: ({ spyRebelKilled, spyFinalTrio }: PointsData) =>
          8 + 5 * spyRebelKilled + (spyFinalTrio ? 15 : 0),
      },
      required: ["spyFinalTrio", "spyRebelKilled"],
    },
    spy: {
      king: {
        points: () => 18,
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 9,
      },
      spy: {
        points: () => 85,
      },
      required: ["loyalDeathOnLastRebelDeath"],
    },
  },
  7: {
    minRebel: 3,
    maxRebel: 3,
    minLoyal: 2,
    maxLoyal: 2,
    minSpy: 1,
    maxSpy: 1,
    king: {
      king: {
        points: ({ loyalistAlive }: PointsData) => {
          if (loyalistAlive === 3) {
            return 51;
          } else if (loyalistAlive === 2) {
            return 47;
          } else {
            return 43;
          }
        },
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 6,
      },
      spy: {
        points: ({ loyalistDeath, spyFinalDuel }: PointsData) =>
          8 + 5 * loyalistDeath + (spyFinalDuel ? 14 : 0),
      },
      required: ["loyalDeathOnLastRebelDeath", "spyFinalDuel"],
    },
    rebel: {
      king: {
        points: ({ rebelDeath }: PointsData) => rebelDeath * 4,
      },
      rebel: {
        points: ({ rebelAlive }: PointsData) => {
          if (rebelAlive === 3) {
            return 53;
          } else if (rebelAlive === 2) {
            return 49;
          } else {
            return 45;
          }
        },
      },
      spy: {
        points: ({ spyRebelKilled, spyFinalTrio }: PointsData) =>
          8 + 5 * spyRebelKilled + (spyFinalTrio ? 15 : 0),
      },
      required: ["spyFinalTrio", "spyRebelKilled"],
    },
    spy: {
      king: {
        points: () => 18,
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 6,
      },
      spy: {
        points: () => 90,
      },
      required: ["loyalDeathOnLastRebelDeath"],
    },
  },
  8: {
    minRebel: 3,
    maxRebel: 4,
    minLoyal: 2,
    maxLoyal: 2,
    minSpy: 1,
    maxSpy: 2,
    king: {
      king: {
        points: ({ loyalistAlive }: PointsData) => {
          if (loyalistAlive === 3) {
            return 57;
          } else if (loyalistAlive === 2) {
            return 53;
          } else {
            return 49;
          }
        },
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 5,
      },
      spy: {
        points: ({ loyalistDeath, spyFinalDuel }: PointsData) =>
          9 + 5 * loyalistDeath + (spyFinalDuel ? 15 : 0),
      },
      required: ["loyalDeathOnLastRebelDeath", "spyFinalDuel"],
    },
    rebel: {
      king: {
        points: ({ rebelDeath }: PointsData) => rebelDeath * 4,
      },
      rebel: {
        points: ({ rebelAlive }: PointsData) => {
          if (rebelAlive === 4) {
            return 51;
          } else if (rebelAlive === 3) {
            return 48;
          } else if (rebelAlive === 2) {
            return 45;
          } else {
            return 43;
          }
        },
      },
      spy: {
        points: ({ spyRebelKilled, spyFinalTrio }: PointsData) =>
          9 + 5 * spyRebelKilled + (spyFinalTrio ? 15 : 0),
      },
      required: ["spyFinalTrio", "spyRebelKilled"],
    },
    spy: {
      king: {
        points: () => 20,
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 5,
      },
      spy: {
        points: () => 95,
      },
      required: ["loyalDeathOnLastRebelDeath"],
    },
  },
  9: {
    minRebel: 4,
    maxRebel: 4,
    minLoyal: 2,
    maxLoyal: 3,
    minSpy: 1,
    maxSpy: 2,
    king: {
      king: {
        points: ({ loyalistAlive }: PointsData) => {
          if (loyalistAlive === 4) {
            return 57;
          } else if (loyalistAlive === 3) {
            return 53;
          } else if (loyalistAlive === 2) {
            return 49;
          } else {
            return 46;
          }
        },
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 5,
      },
      spy: {
        points: ({ loyalistDeath, spyFinalDuel }: PointsData) =>
          9 + 5 * loyalistDeath + (spyFinalDuel ? 15 : 0),
      },
      required: ["loyalDeathOnLastRebelDeath", "spyFinalDuel"],
    },
    rebel: {
      king: {
        points: ({ rebelDeath }: PointsData) => rebelDeath * 3,
      },
      rebel: {
        points: ({ rebelAlive }: PointsData) => {
          if (rebelAlive === 4) {
            return 56;
          } else if (rebelAlive === 3) {
            return 54;
          } else if (rebelAlive === 2) {
            return 52;
          } else {
            return 51;
          }
        },
      },
      spy: {
        points: ({ spyRebelKilled, spyFinalTrio }: PointsData) =>
          9 + 5 * spyRebelKilled + (spyFinalTrio ? 15 : 0),
      },
      required: ["spyFinalTrio", "spyRebelKilled"],
    },
    spy: {
      king: {
        points: () => 20,
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 5,
      },
      spy: {
        points: () => 105,
      },
      required: ["loyalDeathOnLastRebelDeath"],
    },
  },
  10: {
    minRebel: 4,
    maxRebel: 5,
    minLoyal: 3,
    maxLoyal: 3,
    minSpy: 1,
    maxSpy: 2,
    king: {
      king: {
        points: ({ loyalistAlive }: PointsData) => {
          if (loyalistAlive === 4) {
            return 59;
          } else if (loyalistAlive === 3) {
            return 54;
          } else if (loyalistAlive === 2) {
            return 49;
          } else {
            return 46;
          }
        },
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 5,
      },
      spy: {
        points: ({ loyalistDeath, spyFinalDuel }: PointsData) =>
          10 + 6 * loyalistDeath + (spyFinalDuel ? 16 : 0),
      },
      required: ["loyalDeathOnLastRebelDeath", "spyFinalDuel"],
    },
    rebel: {
      king: {
        points: ({ rebelDeath }: PointsData) => rebelDeath * 3,
      },
      rebel: {
        points: ({ rebelAlive }: PointsData) => {
          if (rebelAlive === 4) {
            return 60;
          } else if (rebelAlive === 3) {
            return 56;
          } else if (rebelAlive === 2) {
            return 52;
          } else {
            return 49;
          }
        },
      },
      spy: {
        points: ({ spyRebelKilled, spyFinalTrio }: PointsData) =>
          10 + 6 * spyRebelKilled + (spyFinalTrio ? 16 : 0),
      },
      required: ["spyFinalTrio", "spyRebelKilled"],
    },
    spy: {
      king: {
        points: () => 22,
      },
      rebel: {
        points: ({ loyalDeathOnLastRebelDeath }: PointsData) =>
          loyalDeathOnLastRebelDeath * 5,
      },
      spy: {
        points: () => 115,
      },
      required: ["loyalDeathOnLastRebelDeath"],
    },
  },
};
