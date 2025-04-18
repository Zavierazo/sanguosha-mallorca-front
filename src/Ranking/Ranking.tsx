import React, { useState } from "react";
import Navbar from "../Navbar";
import CreatableSelect from "react-select/creatable";
import Modal from "react-modal";
import players from "./players.json";
import RankingModal from "../RankingModal";
import { useLocalStorage } from "@uidotdev/usehooks";
import { CopyBlock, dracula } from "react-code-blocks";

export interface PlayerScore {
  role: string | null;
  score: number;
  alive: boolean;
  winner: boolean;
}
export interface GameScore {
  winner: string | null;
  loyalDeathOnLastRebelDeath: number;
  spyRebelKilled: number;
  spyFinalDuel: boolean;
  spyFinalTrio: boolean;
}

const playerOptions = players.map((player) => ({
  value: player.name,
  label: player.name,
}));

Modal.setAppElement("#root");

const Ranking = () => {
  const [playerChoice, setPlayerChoice] = useLocalStorage<string[]>(
    "playerChoice-v1",
    []
  );
  const [playerScores, setPlayerScores] = useLocalStorage<PlayerScore[][]>(
    "playerScore-v1",
    []
  );
  const [gameScores, setGameScores] = useLocalStorage<GameScore[]>(
    "gameScore-v1",
    []
  );
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [isOpen, setIsOpen] = React.useState(false);
  const [rawText, setRawText] = useState<string>(getRawText(playerScores));
  const [gameLevel, setGameLevel] = useState<number>(0);

  function openModal(round: number) {
    setCurrentRound(round);
    setIsOpen(true);
  }

  function closeModal() {
    setCurrentRound(0);
    setIsOpen(false);
  }

  function submitRoundData(player: PlayerScore[], game: GameScore) {
    const newPlayerScores = playerScores.map((playerScore, index) =>
      index === currentRound - 1 ? player : playerScore
    );
    const newGameScores = gameScores.map((gameScore, index) =>
      index === currentRound - 1 ? game : gameScore
    );
    setPlayerScores(newPlayerScores);
    setGameScores(newGameScores);
    setRawText(getRawText(newPlayerScores));
    closeModal();
  }

  function getRawText(playerScores: PlayerScore[][]) {
    const today = new Date();
    const formattedDate = today.toISOString().split("T")[0]; 
    const dateLine = `gameDate = '${formattedDate}'`;

    const countLine = `gameLevel = ${gameLevel};`;

    const roundRows = playerScores
      .map((playerScore, roundIndex) =>
        playerScore
          .filter((score) => score.role !== null)
          .map(
            (score, playerIndex) =>
              `(@lastTorneoId, ${roundIndex + 1}, '${
                playerChoice[playerIndex]
              }', '${score.role}', ${score.score}, ${score.winner ? 1 : 0})`
          )
      )
      .flat();
      return [dateLine, countLine, ...roundRows].join("\n");
  }

  return (
    <div className="Ranking-component">
      <Navbar />
      <h1 className="text-3xl font-bold underline m-6">Ranking Tool</h1>
      <div className="mb-4">
      <label htmlFor="gameLevel" className="block text-lg font-medium">
        Game level:
      </label>
      <input
        id="gameLevel"
        type="number"
        min="0"
        max="13"
        value={gameLevel}
        onChange={(e) => setGameLevel(Number(e.target.value))}
        className="mt-1 border border-gray-300 rounded px-2 py-1"
      />
    </div>      
      <h2>Input the names in the order the players are sitting, starting with the ruler.</h2>
      <CreatableSelect
        isMulti
        isSearchable={true}
        isOptionDisabled={() => playerChoice.length >= 10}
        options={playerOptions}
        defaultValue={playerChoice.map((player) => ({
          value: player,
          label: player,
        }))}
        onChange={(choices) => {
          const selectedValues = choices.map((option) => option.value);
          setPlayerChoice(selectedValues);
          setPlayerScores(
            new Array<PlayerScore[]>(selectedValues.length).fill(
              new Array<PlayerScore>(selectedValues.length).fill({
                role: null,
                score: 0,
                alive: true,
                winner: false,
              })
            )
          );
          setGameScores(
            new Array<GameScore>(selectedValues.length).fill({
              winner: null,
              loyalDeathOnLastRebelDeath: 0,
              spyRebelKilled: 0,
              spyFinalDuel: false,
              spyFinalTrio: false,
            })
          );
          setRawText("");
        }}
      />
      <div className="table w-full p-2">
        {playerChoice.length < 5 || playerChoice.length > 10 ? (
          <h2>Number of players must be between 5 and 10 players.</h2>
        ) : (
          <>
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="p-2 border-r cursor-pointer text-sm font-thin text-gray-500">
                    <div className="flex items-center justify-center">
                      Round
                    </div>
                  </th>
                  {playerChoice.map((player, index) => (
                    <th
                      key={index}
                      className="p-2 border-r cursor-pointer text-sm font-thin text-gray-500"
                    >
                      <div className="flex items-center justify-center">
                        {player}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  { length: playerChoice.length },
                  (_, i) => i + 1
                ).map((round, index) => (
                  <tr key={index} className="bg-gray-50 text-center">
                    <td className="p-2 border-r">
                      <div className="flex items-center justify-center gap-2">
                        <span>Round&nbsp;{round}</span>
                        <button
                          type="button"
                          className="px-2 py-1 text-xs font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300"
                          onClick={() => openModal(round)}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    {playerChoice.map((player, playerIndex) => (
                      <td
                        key={playerIndex}
                        className={
                          "p-2 border-r" +
                          (playerScores[index]?.[playerIndex]?.winner
                            ? " font-bold"
                            : "") +
                          (playerScores[index]?.[playerIndex]?.alive
                            ? ""
                            : " text-red-500")
                        }
                      >
                        {playerScores[index]?.[playerIndex]?.role &&
                          playerScores[index][playerIndex].role +
                            " " +
                            playerScores[index][playerIndex]?.score}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-5">
              <h3>Raw data</h3>
              <div className="text-sm text-gray-500 text-start">
                <CopyBlock
                  text={rawText}
                  language={"SQL"}
                  showLineNumbers={true}
                  theme={dracula}
                />
              </div>
            </div>
          </>
        )}
        <Modal
          isOpen={isOpen}
          onRequestClose={closeModal}
          contentLabel="Round Modal"
        >
          <RankingModal
            players={playerChoice}
            currentRound={currentRound}
            previousPoints={playerScores[currentRound - 1]}
            previousScore={gameScores[currentRound - 1]}
            handleClose={closeModal}
            submitRoundData={submitRoundData}
          />
        </Modal>
      </div>
    </div>
  );
};

Ranking.propTypes = {
  // bla: PropTypes.string,
};

Ranking.defaultProps = {
  // bla: 'test',
};

export default Ranking;
