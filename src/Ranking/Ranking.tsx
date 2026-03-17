import React, { useCallback, useEffect, useState } from "react";
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
  const [gameLevel, setGameLevel] = useState<number>(0);
  const [gameDescription, setGameDescription] = useLocalStorage<string>(
    "gameDescription-v1",
    ""
  );
  const [lastTorneoId, setLastTorneoId] = useLocalStorage<string>(
    "lastTorneoId-v1",
    ""
  );
  const [isRanked, setIsRanked] = useLocalStorage<boolean>("isRanked-v1", true);

  const getRawText = useCallback(
    (
      playerScores: PlayerScore[][],
      players: string[] = playerChoice,
      description: string = gameDescription
    ) => {
      const today = new Date();
      const formattedDate = today.toISOString().split("T")[0];
      const dateLine = `SET @gameDate = '${formattedDate}'`;

      const levelLine = `SET @nivel = ${gameLevel}`;
      const safeDescription = description.replace(/'/g, "''");
      const descriptionLine = `SET @descripcion = '${safeDescription}'`;
      const lastTorneoIdLine = `SET @lastTorneoId = ${lastTorneoId ? lastTorneoId : 'NULL'}`;
      const isRankedLine = `SET @isRanked = ${isRanked ? 1 : 0}`;

      const roundRows = playerScores
        .map((playerScore, roundIndex) =>
          playerScore
            .filter((score) => score.role !== null)
            .map(
              (score, playerIndex) =>
                `(@lastTorneoId, ${roundIndex + 1}, '${
                  players[playerIndex]
                }', '${score.role}', ${score.score}, ${score.winner ? 1 : 0})`
            )
        )
        .flat();
      const header = [dateLine, levelLine, descriptionLine, lastTorneoIdLine, isRankedLine].join("\n") + "\n";
      const body = roundRows.join(",\n");
      return header + body;
    },
    [gameDescription, gameLevel, isRanked, lastTorneoId, playerChoice]
  );

  useEffect(() => {
    setRawText(getRawText(playerScores));
  }, [playerScores, playerChoice, gameLevel, gameDescription, lastTorneoId, isRanked, getRawText]);

  const [rawText, setRawText] = useState<string>(getRawText(playerScores));

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

  function getShuffledIndices(length: number) {
    const indices = Array.from({ length }, (_, i) => i);
    for (let i = length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }

  function handleRandomize() {
    if (playerChoice.length === 0) return;
    const shuffledIndices = getShuffledIndices(playerChoice.length);
    const newPlayerChoice = shuffledIndices.map(i => playerChoice[i]);
    const newPlayerScores = playerScores.map(round => shuffledIndices.map(i => round[i]));
    setPlayerChoice(newPlayerChoice);
    setPlayerScores(newPlayerScores);
    setRawText(getRawText(newPlayerScores, newPlayerChoice));
  }

  return (
    <div className="Ranking-component">
      <Navbar />
      <h1 className="text-3xl font-bold underline m-6">Generador de puntuaciones 2024</h1>
      <div className="mb-4">
      <a
        href="/Puntuaciones_2024_v2.pdf"
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline"
      >
      Puntuaciones 2024 en PDF
  </a>
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
      <label htmlFor="gameDescription" className="block text-lg font-medium mt-4">
        Descripción:
      </label>
      <input
        id="gameDescription"
        type="text"
        value={gameDescription}
        onChange={(e) => setGameDescription(e.target.value)}
        className="mt-1 border border-gray-300 rounded px-2 py-1"
      />
      <label htmlFor="lastTorneoId" className="block text-lg font-medium mt-4">
        Continuación de torneo:
      </label>
      <input
        id="lastTorneoId"
        type="number"
        min="0"
        max="999"
        value={lastTorneoId}
        onChange={(e) => setLastTorneoId(e.target.value)}
        className="mt-1 border border-gray-300 rounded px-2 py-1"
      />
      <label htmlFor="isRanked" className="block text-lg font-medium mt-4">
        Ranked:
      </label>
      <div className="mt-1">
        <input
          id="isRanked"
          type="checkbox"
          checked={isRanked}
          onChange={(e) => setIsRanked(e.target.checked)}
          className="w-4 h-4"
        />
      </div>
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
      <button
        type="button"
        className="mt-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:ring-4 focus:outline-none focus:ring-green-300"
        onClick={handleRandomize}
      >
        Randomize Order
      </button>
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
                  {/* Fila de sumatorio */}
                <tr className="bg-gray-200 font-bold">
                  <td className="p-2 border-r text-right">Total</td>
                  {playerChoice.map((player, playerIndex) => {
                    // Suma los puntos de este jugador en todas las rondas no vacías
                    const total = playerScores.reduce((sum, round) => {
                      const score = round?.[playerIndex]?.score;
                      return typeof score === "number" ? sum + score : sum;
                    }, 0);
                    return (
                      <td key={playerIndex} className="p-2 border-r">
                        {total}
                      </td>
                    );
                  })}
                </tr>
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
