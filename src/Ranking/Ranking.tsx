import React, { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../Navbar";
import CreatableSelect from "react-select/creatable";
import Modal from "react-modal";
import players from "./players.json"; // fallback
import RankingModal from "../RankingModal";
import { useLocalStorage } from "@uidotdev/usehooks";
import { CopyBlock, dracula } from "react-code-blocks";
import { StyleSheetManager } from "styled-components";
import GuardarPartida from "./GuardarPartida";
import { buildFilas, type CrearTorneoResultado } from "../supabase/crearTorneo";
import {
  createDataSource,
  describeSource,
  type DataSourceStatus,
} from "../data";

export interface PlayerScore {
  role: string | null;
  score: number;
  alive: boolean;
  winner: boolean;
  imported?: boolean; // Marca si la fila fue importada del Google Sheet
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
  scoringSystem: string | null;
}

const initialPlayerOptions = players.map((player) => ({
  value: player.name,
  label: player.name,
}));

/**
 * De dónde salen los datos: Supabase, con Google Sheets como vuelta atrás.
 *
 * Se crea una sola vez fuera del componente. Cada instancia cachea la descarga
 * de la hoja y recuerda si ha tenido que recurrir a la otra fuente; crearla en
 * cada render tiraría las dos cosas.
 *
 * Para forzar una fuente sin desplegar: ?datos=sheets  /  ?datos=supabase.
 * Ver src/data/index.ts.
 */
const datos = createDataSource();

/**
 * Sistema de puntuación con el que se calculan estos puntos.
 *
 * En la base de datos identifica el reglamento vigente de cada torneo, y la
 * validación exige que coincida con el del torneo al continuarlo. Esta pantalla
 * es el "Generador de puntuaciones 2024", así que siempre emite 2024-01-01.
 * Valores históricos: 2011-01-01, 2020-01-01, 2021-04-01, 2024-01-01.
 */
const SCORING_SYSTEM = "2024-01-01";

/**
 * Rango de niveles de partida válidos.
 *
 * El 0 no es un nivel: `partidas.nivel` multiplica la experiencia con la fórmula
 * `xp_base + incremento * (nivel - 1)`, así que un 0 daría MENOS experiencia que
 * un 1 (16,5 en vez de 20). Estaba en el desplegable y no hay nada en la base de
 * datos que lo impida, así que se cierra aquí.
 *
 * Ojo: si se cambia el mínimo hay que mantener a la vez el valor inicial de
 * `gameLevel` y el caso "sin jugadores" de `calculateMinLevel`. Un `gameLevel`
 * fuera del rango del desplegable no mostraría ninguna opción seleccionada, el
 * navegador pintaría la primera y se guardaría un valor distinto del que se ve.
 */
const NIVEL_MINIMO = 1;
const NIVEL_MAXIMO = 15;

/**
 * Fecha de la sesión de juego, en formato ISO.
 *
 * toISOString() da la fecha en UTC, no en hora local: una partida cerrada a la
 * 00:30 en Mallorca (UTC+2) queda fechada el día anterior. Para sesiones de
 * juego nocturnas es justo lo que se quiere, así que se mantiene tal cual
 * estaba. El mismo valor se manda a la BD, de modo que el SQL de texto y la
 * inserción directa fechan la partida igual.
 */
function fechaDeHoy(): string {
  return new Date().toISOString().split("T")[0];
}

Modal.setAppElement("#root");

const Ranking = () => {
  const [playerOptions, setPlayerOptions] = useState(initialPlayerOptions);
  const [monthsFilter, setMonthsFilter] = useState<number>(3);

  const [sourceStatus, setSourceStatus] = useState<DataSourceStatus>(() =>
    datos.getStatus()
  );

  // Repinta el indicador si hubo que recurrir a la otra fuente a media sesión.
  useEffect(() => datos.subscribe(setSourceStatus), []);

  /**
   * Recarga jugadores, niveles y torneos de la fuente activa.
   *
   * Las tres consultas son independientes, así que van en paralelo. Con la hoja
   * de Google esto eran dos descargas secuenciales del mismo fichero de 3 MB.
   */
  const refrescarDatos = useCallback(async () => {
    setUpdateStatus("updating");

    try {
      const [actividad, niveles, torneos] = await Promise.all([
        datos.fetchPlayerActivity(),
        datos.fetchPlayerLevels(),
        datos.fetchTournaments(),
      ]);

      // Mismo criterio que con la hoja: se compara contra "hoy hace N meses"
      // sin tocar la hora, y un jugador sin fecha entra siempre.
      const corte = new Date();
      corte.setMonth(corte.getMonth() - monthsFilter);

      const opciones = actividad
        .filter(({ ultimaPartida }) => {
          if (!ultimaPartida) return true;
          const [year, month, day] = ultimaPartida.split("-").map(Number);
          return new Date(year, month - 1, day) >= corte;
        })
        .map(({ nombre }) => ({ value: nombre, label: nombre }));

      // Si no vuelve nadie se conserva la lista anterior, que en el primer
      // arranque es players.json. Mejor eso que un selector vacío.
      if (opciones.length > 0) {
        setPlayerOptions(opciones);
      }

      setPlayerLevels(
        new Map(niveles.map(({ nombre, nivel }) => [nombre, nivel]))
      );
      setTournamentsData(torneos);

      setUpdateStatus("done");
      setTimeout(() => setUpdateStatus("idle"), 2000);
    } catch (error) {
      // Aquí sólo se llega si fallaron las dos fuentes.
      console.error("No se han podido cargar los datos:", error);
      setUpdateStatus("idle");
    }
  }, [monthsFilter]);

  useEffect(() => {
    refrescarDatos();
  }, [refrescarDatos]);

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
  const [gameLevel, setGameLevel] = useState<number>(NIVEL_MINIMO);
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
  const [introductionOrder, setIntroductionOrder] = useState<string[]>([]);
  const [hasBeenRandomized, setHasBeenRandomized] = useState<boolean>(false);
  const [playerLevels, setPlayerLevels] = useState<Map<string, number | null>>(new Map());
  /**
   * Si alguien ha tocado el desplegable de nivel a mano.
   *
   * Existe para que el recálculo automático no le pise la elección. No se
   * persiste a propósito: al recargar vuelve a false y el nivel se recalcula,
   * que es justo lo que se quiere.
   */
  const [gameLevelElegidoAMano, setGameLevelElegidoAMano] = useState<boolean>(false);

  /**
   * Nivel de partida que se propone: el del jugador menos veterano de la mesa.
   *
   * Sin nivel cuenta como nivel 1, no como "no se sabe". Son dos casos:
   * el jugador que aún no tiene `max_nivel_jugado` (114 de 174) y el que se
   * acaba de crear en el selector y no está en la tabla. En los dos, lo correcto
   * es empezar por el principio, y además arrastra el mínimo hacia abajo, que es
   * el lado seguro: una mesa se juega al nivel del que menos sabe.
   *
   * Descartarlos, que es lo que se hacía antes, proponía el nivel del veterano
   * de un grupo de novatos.
   */
  const calculateMinLevel = useCallback((players: string[]) => {
    // Sin jugadores no hay nada que calcular. Se devuelve el mínimo válido, no 0:
    // vaciar el selector dejaba el nivel en 0, y el 0 ya no existe como opción.
    if (players.length === 0) return NIVEL_MINIMO;
    const levels = players.map((player) => playerLevels.get(player) ?? NIVEL_MINIMO);
    return Math.min(...levels);
  }, [playerLevels]);

  /**
   * Recalcula el nivel cuando llegan los niveles de los jugadores.
   *
   * Hace falta porque la selección de jugadores se restaura del navegador de
   * forma inmediata, pero los niveles tardan lo que tarde la consulta. Sin esto,
   * al recargar la página el nivel se quedaba en su valor inicial hasta que
   * alguien tocaba el selector, y ese valor acabaría tal cual en la base de datos
   * y en el `SET @nivel` del SQL que se genera.
   *
   * No se toca el nivel si ya lo han elegido a mano, ni antes de que lleguen los
   * datos: con el mapa vacío, `calculateMinLevel` daría 1 para todo el mundo por
   * la regla de "sin nivel = 1", y eso sería inventarse un dato.
   */
  useEffect(() => {
    if (gameLevelElegidoAMano) return;
    if (playerChoice.length === 0) return;
    if (playerLevels.size === 0) return;
    setGameLevel(calculateMinLevel(playerChoice));
  }, [playerLevels, playerChoice, gameLevelElegidoAMano, calculateMinLevel]);

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

  /**
   * Trae las partidas ya jugadas de un torneo, para pintarlas y continuarlo.
   *
   * Devuelve null si no se pudo leer. La pantalla lo trata como "no hay nada
   * que importar" y sigue funcionando en modo manual, que es el comportamiento
   * que ya tenía.
   */
  const fetchTournamentData = useCallback(async (torneoId: string) => {
    try {
      return await datos.fetchTournamentRounds(torneoId);
    } catch (error) {
      console.error("No se han podido leer las partidas del torneo:", error);
      return null;
    }
  }, []);

  function handleTournamentOrder() {
    if (!activeTournament || playerChoice.length === 0) return;
    
    // Redirect to old ranking site for 2021 scoring system
    if (activeTournament.scoringSystem === '2021-04-01') {
      window.location.href = 'https://sanguosha.es/alvaro/ranking';
      return;
    }

    // Auto-fill the continuation torneo ID
    setLastTorneoId(activeTournament.torneoId.toString());
    
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

    // Importar datos del torneo desde Google Sheet
    fetchTournamentData(activeTournament.torneoId.toString()).then(tournamentData => {
      if (tournamentData && tournamentData.size > 0) {
        // Crear matriz de puntuaciones para los jugadores actuales
        const maxRound = Math.max(...Array.from(tournamentData.keys()));
        const importedScores: PlayerScore[][] = [];
        const importedGameScores: GameScore[] = [];
        
        for (let round = 1; round <= maxRound; round++) {
          const roundData = tournamentData.get(round);
          if (roundData) {
            const roundScores: PlayerScore[] = tournamentOrder.map(player => {
              const playerData = roundData.get(player);
              if (playerData) {
                return {
                  role: playerData.role,
                  score: playerData.score,
                  alive: true, // Por defecto, asumimos que están vivos
                  winner: playerData.winner,
                  imported: true // Marcar como importado del Google Sheet
                };
              }
              return {
                role: null,
                score: 0,
                alive: true,
                winner: false,
                imported: false // Marcar como no importado
              };
            });
            importedScores.push(roundScores);
            
            // Crear GameScore para esta ronda (valores por defecto)
            importedGameScores.push({
              winner: null,
              loyalDeathOnLastRebelDeath: 0,
              spyRebelKilled: 0,
              spyFinalDuel: false,
              spyFinalTrio: false
            });
          }
        }
        
        // Actualizar los scores con los datos importados
        if (importedScores.length > 0) {
          setPlayerScores(importedScores);
          setGameScores(importedGameScores);
          setRawText(getRawText(importedScores, tournamentOrder));
        }
      }
    });
  }

  const getRawText = useCallback(
    (
      playerScores: PlayerScore[][],
      players: string[] = playerChoice,
      description: string = gameDescription
    ) => {
      const dateLine = `SET @gameDate = '${fechaDeHoy()}'`;

      const levelLine = `SET @nivel = ${gameLevel}`;
      const safeDescription = description.replace(/'/g, "''");
      const descriptionLine = `SET @descripcion = '${safeDescription}'`;
      const lastTorneoIdLine = `SET @lastTorneoId = ${lastTorneoId ? lastTorneoId : 'NULL'}`;
      const isRankedLine = `SET @isRanked = ${isRanked ? 1 : 0}`;

      // Mismas filas que se mandan a la BD: una sola implementación para los
      // dos caminos, así el SQL de texto y la inserción directa no pueden
      // divergir. buildFilas empareja nombre y puntuación antes de filtrar, que
      // es lo que aquí estaba al revés: con filas importadas de un torneo
      // continuado, el índice del array ya filtrado desplazaba los nombres.
      const roundRows = buildFilas(playerScores, players).map(
        (fila) =>
          `(@lastTorneoId, ${fila.num_partida}, '${fila.jugador.replace(
            /'/g,
            "''"
          )}', '${fila.rol}', ${fila.puntos}, ${fila.ganada ? 1 : 0})`
      );
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

  /**
   * Las filas que se enviarán a la base de datos: exactamente las mismas tuplas
   * que muestra el bloque de SQL. Memoizadas para que GuardarPartida pueda
   * detectar por contenido si los datos han cambiado.
   */
  const filasParaBD = useMemo(
    () => buildFilas(playerScores, playerChoice),
    [playerScores, playerChoice]
  );

  /** El campo es un input de texto: sólo vale como id un entero positivo. */
  const torneoIdParaBD = useMemo(() => {
    const n = parseInt(lastTorneoId, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [lastTorneoId]);

  const handleGuardado = useCallback(
    (resultado: CrearTorneoResultado) => {
      // Apuntar el torneo recién creado para que las rondas siguientes se
      // añadan a él en lugar de abrir otro. Es lo que antes había que copiar a
      // mano en "Continuación de torneo".
      setLastTorneoId(String(resultado.torneo_id));
    },
    [setLastTorneoId]
  );

  function openModal(round: number) {
    setCurrentRound(round);
    setIsOpen(true);
  }

  function closeModal() {
    setCurrentRound(0);
    setIsOpen(false);
  }

  function submitRoundData(player: PlayerScore[], game: GameScore) {
    // Si currentRound está fuera de rango, extender los arrays
    let newPlayerScores = [...playerScores];
    let newGameScores = [...gameScores];
    
    if (currentRound > newPlayerScores.length) {
      // Extender arrays hasta incluir currentRound
      while (newPlayerScores.length < currentRound) {
        newPlayerScores.push(player.map(() => ({
          role: null,
          score: 0,
          alive: true,
          winner: false,
          imported: false,
        })));
      }
      while (newGameScores.length < currentRound) {
        newGameScores.push({
          winner: null,
          loyalDeathOnLastRebelDeath: 0,
          spyRebelKilled: 0,
          spyFinalDuel: false,
          spyFinalTrio: false,
        });
      }
    }
    
    // Actualizar la ronda actual
    newPlayerScores = newPlayerScores.map((playerScore, index) =>
      index === currentRound - 1 ? player : playerScore
    );
    newGameScores = newGameScores.map((gameScore, index) =>
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
    
    // Limpiar filas importadas del Google Sheet
    const cleanedScores = playerScores.map(round => 
      round.map(score => ({
        ...score,
        role: score.imported ? null : score.role,
        score: score.imported ? 0 : score.score,
        winner: score.imported ? false : score.winner,
        imported: false
      }))
    );
    
    const shuffledIndices = getShuffledIndices(playerChoice.length);
    const newPlayerChoice = shuffledIndices.map(i => playerChoice[i]);
    const newPlayerScores = cleanedScores.map(round => shuffledIndices.map(i => round[i]));
    
    setPlayerChoice(newPlayerChoice);
    setPlayerScores(newPlayerScores);
    setRawText(getRawText(newPlayerScores, newPlayerChoice));
  }

  function handleRestoreOriginalOrder() {
    // Usar el orden de introducción del componente en lugar del orden guardado
    // Filtrar introductionOrder para incluir solo los jugadores actuales
    const filteredIntroductionOrder = introductionOrder.filter(player => playerChoice.includes(player));
    const orderToRestore = filteredIntroductionOrder.length > 0 ? filteredIntroductionOrder : originalPlayerOrder;
    if (orderToRestore.length === 0) return;
    
    // Limpiar filas importadas del Google Sheet
    const cleanedScores = playerScores.map(round => 
      round.map(score => ({
        ...score,
        role: score.imported ? null : score.role,
        score: score.imported ? 0 : score.score,
        winner: score.imported ? false : score.winner,
        imported: false
      }))
    );
    
    // Crear un mapa para restaurar los scores al orden original
    const currentIndexMap = new Map(playerChoice.map((player, index) => [player, index]));
    const newPlayerScores = cleanedScores.map(round => 
      orderToRestore.map(player => round[currentIndexMap.get(player)!])
    );
    
    setPlayerChoice(orderToRestore);
    setPlayerScores(newPlayerScores);
    setRawText(getRawText(newPlayerScores, orderToRestore));
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
      <div className="flex items-center justify-center mt-4">
        <label htmlFor="isRanked" className="text-lg font-medium">
          Ranked:
        </label>
        <input
          id="isRanked"
          type="checkbox"
          checked={isRanked}
          onChange={(e) => setIsRanked(e.target.checked)}
          className="ml-2 w-4 h-4"
        />
      </div>
    </div>      
      <div className="flex items-center justify-center gap-2 mb-4">
        <input
          id="monthsFilter"
          name="monthsFilter"
          type="number"
          min="1"
          max="120"
          value={monthsFilter}
          onChange={(e) => setMonthsFilter(Math.max(1, Math.min(120, parseInt(e.target.value) || 3)))}
          className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
          title="Número de meses hacia atrás para filtrar jugadores"
        />
        <span className="text-sm text-gray-600">meses</span>
        <button
          type="button"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300"
          onClick={refrescarDatos}
          title={`Actualizar datos desde ${describeSource(sourceStatus.active)}`}
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
      {/*
        Qué fuente está respondiendo. Discreto cuando es la esperada, y bien
        visible cuando ha habido que recurrir a la otra: si alguien apunta unas
        puntuaciones sobre datos que salieron de la copia en Google Sheets en
        lugar de la base de datos, tiene que saberlo.
      */}
      {sourceStatus.active === sourceStatus.preferred ? (
        <p className="mb-4 text-xs text-gray-500">
          Datos: {describeSource(sourceStatus.active)}
        </p>
      ) : (
        <p
          className="mb-4 mx-auto max-w-2xl rounded border border-yellow-300 bg-yellow-100 p-2 text-sm text-yellow-800"
          role="status"
        >
          ⚠️ {describeSource(sourceStatus.preferred)} no responde, así que estos
          datos vienen de {describeSource(sourceStatus.active)}. Pueden estar
          desactualizados.
          {sourceStatus.fallbackReason && (
            <span className="block text-xs opacity-75">
              {sourceStatus.fallbackReason}
            </span>
          )}
        </p>
      )}
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
          
          // Capturar el orden de introducción (manejar borrados y reintroducciones)
          const currentIntroductionOrder = [...introductionOrder];
          
          // Mantener los jugadores que siguen seleccionados en su posición actual
          const remainingPlayers = currentIntroductionOrder.filter(player => selectedValues.includes(player));
          
          // Añadir los jugadores nuevos o reintroducidos al final
          const newOrReintroducedPlayers = selectedValues.filter(player => !remainingPlayers.includes(player));
          const updatedIntroductionOrder = [...remainingPlayers, ...newOrReintroducedPlayers];
          
          setIntroductionOrder(updatedIntroductionOrder);
          
          // Auto-seleccionar el nivel mínimo de los jugadores. Cambiar la mesa
          // descarta el nivel que se hubiera puesto a mano: era para otra mesa.
          setGameLevelElegidoAMano(false);
          setGameLevel(calculateMinLevel(selectedValues));
          
          setPlayerScores(
            new Array<PlayerScore[]>(selectedValues.length).fill(
              new Array<PlayerScore>(selectedValues.length).fill({
                role: null,
                score: 0,
                alive: true,
                winner: false,
                imported: false,
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
          setIntroductionOrder([]);
          setHasBeenRandomized(false);
          // Limpiar ID de continuación de torneo porque cambió la lista de jugadores
          setLastTorneoId("");
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
      <div className="flex items-center justify-center mt-2">
        <label htmlFor="gameLevel" className="text-sm font-medium">
          Game level:
        </label>
        <select
          id="gameLevel"
          value={gameLevel}
          onChange={(e) => {
            // Marcar la elección como manual para que el recálculo no la pise.
            setGameLevelElegidoAMano(true);
            setGameLevel(Number(e.target.value));
          }}
          className="ml-2 border border-gray-300 rounded px-2 py-1"
        >
          {Array.from(
            { length: NIVEL_MAXIMO - NIVEL_MINIMO + 1 },
            (_, i) => i + NIVEL_MINIMO
          ).map((nivel) => (
            <option key={nivel} value={nivel}>
              {nivel}
            </option>
          ))}
        </select>
        <label htmlFor="lastTorneoId" className="ml-4 text-sm font-medium">
          Continuación de torneo:
        </label>
        <input
          id="lastTorneoId"
          type="number"
          min="0"
          max="999"
          value={lastTorneoId}
          onChange={(e) => setLastTorneoId(e.target.value)}
          className="ml-2 border border-gray-300 rounded px-2 py-1"
        />
      </div>
      <button
        type="button"
        className="mt-2 ml-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:ring-4 focus:outline-none focus:ring-green-300"
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
        <>
          {(activeTournament.scoringSystem === '2024-01-01' || activeTournament.scoringSystem === null) && (
            <button
              type="button"
              className="mt-2 ml-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:ring-4 focus:outline-none focus:ring-purple-300"
              onClick={handleTournamentOrder}
            >
              🏆 Continue Tournament
            </button>
          )}
          {activeTournament.scoringSystem === '2021-04-01' && (
            <button
              type="button"
              className="mt-2 ml-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 focus:ring-4 focus:outline-none focus:ring-orange-300"
              onClick={handleTournamentOrder}
            >
              🏆 Torneo de 2021
            </button>
          )}
          {activeTournament.scoringSystem && activeTournament.scoringSystem < '2021-04-01' && (
            <button
              type="button"
              disabled
              className="mt-2 ml-2 px-4 py-2 text-sm font-medium text-white bg-gray-400 rounded-lg cursor-not-allowed"
            >
              🏆 Torneo anterior a 2021
            </button>
          )}
        </>
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
                        <span>{round}</span>
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
                            : " text-red-500") +
                          (playerScores[index]?.[playerIndex]?.imported
                            ? " bg-blue-50 border-l-4 border-l-blue-400"
                            : "")
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
            <GuardarPartida
              filas={filasParaBD}
              jugadores={playerChoice}
              torneoId={torneoIdParaBD}
              descripcion={gameDescription}
              fecha={fechaDeHoy()}
              scoringSystem={SCORING_SYSTEM}
              nivel={gameLevel}
              isRanked={isRanked}
              onGuardado={handleGuardado}
            />
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
