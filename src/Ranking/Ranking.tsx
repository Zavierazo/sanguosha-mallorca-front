import React, { useCallback, useEffect, useState } from "react";
import Navbar from "../Navbar";
import CreatableSelect from "react-select/creatable";
import Modal from "react-modal";
import players from "./players.json"; // fallback
import RankingModal from "../RankingModal";
import { useLocalStorage } from "@uidotdev/usehooks";
import { CopyBlock, dracula } from "react-code-blocks";
import { StyleSheetManager } from "styled-components";

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

export interface TournamentData {
  torneoId: string;
  jugadores: string[];
  jugadoresOrdenOriginal: string[];
  maxNumPartida: number;
  numJugadores: number;
  isCompleted: boolean;
}

interface GoogleSheetCell {
  v?: string | number | null;
}

interface GoogleSheetRow {
  c?: GoogleSheetCell[] | null;
}

const initialPlayerOptions = players.map((player) => ({
  value: player.name,
  label: player.name,
}));

Modal.setAppElement("#root");

const Ranking = () => {
  const [playerOptions, setPlayerOptions] = useState(initialPlayerOptions);

  const fetchPlayersFromSheet = useCallback(async () => {
    setUpdateStatus('updating');
    const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID;
    const sheetName = import.meta.env.VITE_GOOGLE_SHEET_NAME || "Sheet1";
    if (!sheetId) {
      setUpdateStatus('idle');
      return;
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheetName}`;
    
    try {
      const response = await fetch(sheetUrl);
      if (!response.ok) {
        throw new Error(`Google Sheet response status ${response.status}`);
      }
      const text = await response.text();

      // sheet JSON is wrapped in JS function call
      // Evitar el flag 's' para compatibilidad de TS con target es5/es2017
      const jsonTextMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/);
      if (!jsonTextMatch) {
        throw new Error("Formato de datos de Google Sheet desconocido");
      }

      const sheetData = JSON.parse(jsonTextMatch[1]);
      const rows = sheetData?.table?.rows || [];

      const options = rows
        .map((row: GoogleSheetRow) => {
          const playerName = row.c?.[3]?.v?.toString().trim(); // Columna D (índice 3)
          const fecha = row.c?.[8]?.v; // Columna I (índice 8)
          
          if (!playerName) return null;
          
          // Filtrar por fecha mayor a hace 3 meses
          if (fecha) {
            let fechaJuego: Date;
            
            // Manejar diferentes formatos de fecha de Google Sheets
            if (typeof fecha === 'string' && fecha.startsWith('Date(')) {
              // Formato: Date(2026,2,13)
              const match = fecha.match(/Date\((\d+),(\d+),(\d+)\)/);
              if (match) {
                // Los meses en JavaScript son 0-11, Google Sheets usa 1-12
                fechaJuego = new Date(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
              } else {
                return null;
              }
            } else {
              // Formato ISO: "2026-02-13"
              fechaJuego = new Date(fecha);
            }
            
            const tresMesesAtras = new Date();
            tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);
            
            if (fechaJuego < tresMesesAtras) {
              return null;
            }
          }
          
          return { value: playerName, label: playerName };
        })
        .filter(Boolean);

      // Eliminar duplicados usando un Set
      const uniqueOptions = Array.from(
        new Map(options.map((opt: { value: string; label: string }) => [opt.value, opt])).values()
      );

      if (uniqueOptions.length > 0) {
        setPlayerOptions(uniqueOptions as { value: string; label: string }[]);
      }

      // Obtener datos de torneos
      const tournamentsMap = new Map<string, {
        jugadores: Set<string>;
        jugadoresOrdenOriginal: string[];
        maxNumPartida: number;
        numJugadores: number;
      }>();
      
      rows.forEach((row: GoogleSheetRow) => {
        const torneoId = row.c?.[1]?.v?.toString(); // Columna TorneoID (índice 1)
        const playerName = row.c?.[3]?.v?.toString().trim(); // Columna Jugador (índice 3)
        const numPartida = row.c?.[2]?.v; // Columna numPartida (índice 2)
        const numJugadores = row.c?.[9]?.v; // Columna numJugadores (índice 9)
        
        if (torneoId && playerName) {
          if (!tournamentsMap.has(torneoId)) {
            tournamentsMap.set(torneoId, {
              jugadores: new Set(),
              jugadoresOrdenOriginal: [],
              maxNumPartida: 0,
              numJugadores: typeof numJugadores === 'number' ? numJugadores : Number(numJugadores) || 0
            });
          }
          const tournament = tournamentsMap.get(torneoId)!;
          tournament.jugadores.add(playerName);
          
          // Añadir al orden original solo si no está ya en la lista (mantener primera aparición)
          if (!tournament.jugadoresOrdenOriginal.includes(playerName)) {
            tournament.jugadoresOrdenOriginal.push(playerName);
          }
          
          if (numPartida && Number(numPartida) > tournament.maxNumPartida) {
            tournament.maxNumPartida = Number(numPartida);
          }
        }
      });

      const tournaments: TournamentData[] = Array.from(tournamentsMap.entries()).map(([torneoId, data]) => ({
        torneoId,
        jugadores: Array.from(data.jugadores).sort(),
        jugadoresOrdenOriginal: data.jugadoresOrdenOriginal,
        maxNumPartida: data.maxNumPartida,
        numJugadores: data.numJugadores,
        isCompleted: data.maxNumPartida >= data.numJugadores
      }));

      setTournamentsData(tournaments);
      setUpdateStatus('done');
      setTimeout(() => setUpdateStatus('idle'), 2000); // Reset after 2 seconds

    } catch (error) {
      console.error("Error leyendo jugadores desde Google Sheet:", error);
      setUpdateStatus('idle');
    }
  }, []);

  useEffect(() => {
    fetchPlayersFromSheet();
  }, [fetchPlayersFromSheet]);

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
  const [tournamentsData, setTournamentsData] = useState<TournamentData[]>([]);
  const [tournamentCheckMessage, setTournamentCheckMessage] = useState<string>("");
  const [activeTournament, setActiveTournament] = useState<TournamentData | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'updating' | 'done'>('idle');
  const [originalPlayerOrder, setOriginalPlayerOrder] = useState<string[]>([]);
  const [hasBeenRandomized, setHasBeenRandomized] = useState<boolean>(false);

  // Función para verificar si los jugadores actuales ya han jugado un torneo juntos
  const checkTournamentHistory = useCallback((currentPlayers: string[]) => {
    if (currentPlayers.length < 5) {
      setTournamentCheckMessage("");
      setActiveTournament(null);
      return;
    }

    const sortedCurrentPlayers = currentPlayers.slice().sort();
    
    const matchingTournament = tournamentsData.find(tournament => {
      const sortedTournamentPlayers = tournament.jugadores.slice().sort();
      return sortedTournamentPlayers.length === sortedCurrentPlayers.length &&
             sortedTournamentPlayers.every((player, index) => player === sortedCurrentPlayers[index]);
    });

    if (matchingTournament) {
      setActiveTournament(matchingTournament);
      if (matchingTournament.isCompleted) {
        setTournamentCheckMessage(`⚠️ Estos jugadores ya han jugado juntos en el torneo ${matchingTournament.torneoId} (finalizado)`);
      } else {
        setTournamentCheckMessage(`🔴 Estos jugadores tienen un torneo activo juntos: ${matchingTournament.torneoId} (partida ${matchingTournament.maxNumPartida}/${matchingTournament.numJugadores})`);
      }
    } else {
      setTournamentCheckMessage("✅ Estos jugadores no han jugado juntos en ningún torneo anterior");
      setActiveTournament(null);
    }
  }, [tournamentsData]);

  function handleTournamentOrder() {
    if (!activeTournament || playerChoice.length === 0) return;
    
    // Filtrar el orden original para incluir solo los jugadores actuales
    const tournamentOrder = activeTournament.jugadoresOrdenOriginal.filter(player => 
      playerChoice.includes(player)
    );
    
    // Reordenar playerChoice y playerScores según el orden del torneo
    const currentIndexMap = new Map(playerChoice.map((player, index) => [player, index]));
    const newPlayerScores = playerScores.map(round => 
      tournamentOrder.map(player => round[currentIndexMap.get(player)!])
    );
    
    setPlayerChoice(tournamentOrder);
    setPlayerScores(newPlayerScores);
    setRawText(getRawText(newPlayerScores, tournamentOrder));
  }

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

  // Verificar historial de torneos cuando cambian los jugadores
  useEffect(() => {
    checkTournamentHistory(playerChoice);
  }, [playerChoice, checkTournamentHistory]);

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
    
    // Guardar el orden original solo la primera vez que se randomiza
    if (!hasBeenRandomized) {
      setOriginalPlayerOrder([...playerChoice]);
      setHasBeenRandomized(true);
    }
    
    const shuffledIndices = getShuffledIndices(playerChoice.length);
    const newPlayerChoice = shuffledIndices.map(i => playerChoice[i]);
    const newPlayerScores = playerScores.map(round => shuffledIndices.map(i => round[i]));
    setPlayerChoice(newPlayerChoice);
    setPlayerScores(newPlayerScores);
    setRawText(getRawText(newPlayerScores, newPlayerChoice));
  }

  function handleRestoreOriginalOrder() {
    if (originalPlayerOrder.length === 0) return;
    
    // Crear un mapa para restaurar los scores al orden original
    const currentIndexMap = new Map(playerChoice.map((player, index) => [player, index]));
    const newPlayerScores = playerScores.map(round => 
      originalPlayerOrder.map(player => round[currentIndexMap.get(player)!])
    );
    
    setPlayerChoice(originalPlayerOrder);
    setPlayerScores(newPlayerScores);
    setRawText(getRawText(newPlayerScores, originalPlayerOrder));
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
      <div className="flex items-center justify-center gap-2 mb-4">
        <button
          type="button"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300"
          onClick={fetchPlayersFromSheet}
          title="Actualizar datos desde Google Sheet"
          disabled={updateStatus === 'updating'}
        >
          🔄 Actualizar jugadores
        </button>
        {updateStatus === 'updating' && (
          <span className="text-yellow-600 text-sm font-medium">Actualizando...</span>
        )}
        {updateStatus === 'done' && (
          <span className="text-green-600 text-sm font-medium">✅ Done</span>
        )}
      </div>
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
          // Resetear estados de randomización cuando cambian los jugadores
          setOriginalPlayerOrder([]);
          setHasBeenRandomized(false);
        }}
      />
      {tournamentCheckMessage && (
        <div className={`mt-2 p-2 rounded text-sm ${
          tournamentCheckMessage.includes("🔴") 
            ? "bg-red-100 text-red-800 border border-red-300" 
            : tournamentCheckMessage.includes("⚠️") 
            ? "bg-yellow-100 text-yellow-800 border border-yellow-300" 
            : "bg-green-100 text-green-800 border border-green-300"
        }`}>
          {tournamentCheckMessage}
        </div>
      )}
      <button
        type="button"
        className="mt-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:ring-4 focus:outline-none focus:ring-green-300"
        onClick={handleRandomize}
      >
        🎲 Randomize Order
      </button>
      {hasBeenRandomized && (
        <button
          type="button"
          className="mt-2 ml-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 focus:ring-4 focus:outline-none focus:ring-orange-300"
          onClick={handleRestoreOriginalOrder}
          title="Restaurar al orden original en que se introdujeron los jugadores"
        >
          ↩️ Restore Original Order
        </button>
      )}
      {activeTournament && !activeTournament.isCompleted && (
        <button
          type="button"
          className="mt-2 ml-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:ring-4 focus:outline-none focus:ring-purple-300"
          onClick={handleTournamentOrder}
        >
          🏆 Tournament Order
        </button>
      )}
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
                <StyleSheetManager shouldForwardProp={(prop) => !['codeBlock', 'copied'].includes(prop)}>
                  <CopyBlock
                    text={rawText}
                    language={"SQL"}
                    showLineNumbers={true}
                    theme={dracula}
                    codeBlock={false}
                  />
                </StyleSheetManager>
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
