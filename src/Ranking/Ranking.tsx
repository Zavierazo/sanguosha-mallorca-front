import React, { useState } from 'react';
import { useEffect } from 'react';
import Navbar from '../Navbar';
import Select from 'react-select';
import Modal from 'react-modal';
import players from './players.json'
import RankingModal from '../RankingModal';

const playerOptions = players.map(player => ({ value: player.name, label: player.name }))
const playerChoiceInit = [playerOptions[0], playerOptions[1], playerOptions[2], playerOptions[3], playerOptions[4], playerOptions[5]].map(option => option.value)

Modal.setAppElement('#root');

const Ranking = () => {
  useEffect(() => {
    console.log(`Ranking mounted`)
  }, [])

  const [playerChoice, setPlayerChoice] = useState<string[]>(playerChoiceInit)
  const [currentRound, setCurrentRound] = useState<number>(0)
  const [modalIsOpen, setIsOpen] = React.useState(false);

  function openModal(round: number) {
    setCurrentRound(round)
    setIsOpen(true);
  }

  function afterOpenModal() {
    console.log('test')
  }

  function closeModal() {
    setCurrentRound(0)
    setIsOpen(false);
  }

  return (
    <div className="Ranking-component">
      <Navbar />
      <h1 className="text-3xl font-bold underline m-6">
        Ranking Tool
      </h1>
      <Select isMulti
        isSearchable={true}
        defaultValue={[playerOptions[0], playerOptions[1], playerOptions[2], playerOptions[3], playerOptions[4], playerOptions[5]]}
        isOptionDisabled={() => playerChoice.length >= 10}
        options={playerOptions}
        onChange={(choices) => {
          const selectedValues = choices.map((option) => option.value);
          setPlayerChoice(selectedValues);
        }
        } />
      <div className="table w-full p-2">
        {
          playerChoice.length < 5 ?
            <>
              <h2>Number of players must be between 5 and 10 players.</h2>
            </>
            :
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
                      <th key={index} className="p-2 border-r cursor-pointer text-sm font-thin text-gray-500">
                        <div className="flex items-center justify-center">
                          {player}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: playerChoice.length }, (_, i) => i + 1).map((round, index) => (
                    <tr key={index} className="bg-gray-50 text-center">
                      <td className="p-2 border-r">
                        <div className="flex items-center justify-center gap-2">
                          <span>
                            Round&nbsp;{round}
                          </span>
                          <button
                            type="button"
                            className="px-2 py-1 text-xs font-medium text-center text-white bg-blue-700 rounded-lg hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300"
                            onClick={() => openModal(round)}>
                            +
                          </button>
                        </div>
                      </td>
                      {playerChoice.map((player, index) => (
                        <td key={index} className="p-2 border-r">
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
        }
        <Modal
          isOpen={modalIsOpen}
          onAfterOpen={afterOpenModal}
          onRequestClose={closeModal}
          contentLabel="Example Modal"
        >
          <button onClick={closeModal}>close</button>
          <RankingModal players={playerChoice} currentRound={currentRound} />
        </Modal>
      </div>
    </div>
  )
}

Ranking.propTypes = {
  // bla: PropTypes.string,
};

Ranking.defaultProps = {
  // bla: 'test',
};

export default Ranking;
