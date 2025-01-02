import React, { useState } from "react";
import Navbar from "../Navbar";
import Select from "react-select";
import Modal from "react-modal";
import players from "./players.json";
import RankingModal from "../RankingModal";
import { useLocalStorage } from "@uidotdev/usehooks";

interface PlayerScore {
  role: string | null;
  score: number;
  alive: boolean;
  winner: boolean;
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
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [playerScores, setPlayerScores] = useLocalStorage<PlayerScore[][]>(
    "playerScore-v1",
    []
  );
  const [isOpen, setIsOpen] = React.useState(false);

  function openModal(round: number) {
    setCurrentRound(round);
    setIsOpen(true);
  }

  function closeModal() {
    setCurrentRound(0);
    setIsOpen(false);
  }

  function submitRoundData(score: PlayerScore[]) {
    setPlayerScores(
      playerScores.map((playerScore, index) =>
        index === currentRound - 1 ? score : playerScore
      )
    );
    closeModal();
  }

  return (
    <div className="Ranking-component">
      <Navbar />
      <h1 className="text-3xl font-bold underline m-6">Ranking Tool</h1>
      <Select
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
                alive: false,
                winner: false,
              })
            )
          );
        }}
      />
      <div className="table w-full p-2">
        {playerChoice.length < 5 || playerChoice.length > 10 ? (
          <h2>Number of players must be between 5 and 10 players.</h2>
        ) : (
          <table className="w-full border">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-2 border-r cursor-pointer text-sm font-thin text-gray-500">
                  <div className="flex items-center justify-center">Round</div>
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
              {Array.from({ length: playerChoice.length }, (_, i) => i + 1).map(
                (round, index) => (
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
                )
              )}
            </tbody>
          </table>
        )}
        <Modal
          isOpen={isOpen}
          onRequestClose={closeModal}
          contentLabel="Round Modal"
        >
          <RankingModal
            players={playerChoice}
            currentRound={currentRound}
            handleClose={closeModal}
            submitRoundData={submitRoundData}
          />
        </Modal>
        <div className="mt-5">
          <h3>Raw data</h3>
          <div className="text-sm text-gray-500">
            {playerScores.map((playerScore, roundIndex) =>
              playerScore
                .filter((score) => score.role !== null)
                .map((score, playerIndex) => (
                  <div key={roundIndex * playerIndex}>
                    (@lastTorneoId, {roundIndex + 1}, &apos;
                    {playerChoice[playerIndex]}&apos;, &apos;{score.role}&apos;,{" "}
                    {score.score}, {score.winner ? 1 : 0})
                  </div>
                ))
            )}
          </div>
        </div>
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
