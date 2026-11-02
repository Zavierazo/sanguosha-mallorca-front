import React, { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../Navbar";
import CreatableSelect from "react-select/creatable";
import Modal from "react-modal";
import players from "./players.json";
import RankingModal from "../RankingModal";
import { useLocalStorage } from "@uidotdev/usehooks";
import GuardarPartida from "./GuardarPartida";
import SesionOrganizador from "./SesionOrganizador";
import RawData from "./RawData";
import ImportarRawData from "./ImportarRawData";
import { useAuth } from "../supabase/useAuth";
import { formatRawData, type RawDataPartida } from "./formatoRawData";
import { NIVELES_PARTIDA } from "./niveles";
import {
  calcularAvisoNivel,
  nivelAutomaticoMesa,
  valoresInicialesRonda,
} from "./datosRonda";
import {
  baseDeRonda,
  cerrado,
  escribirBorradores,
  firmaMesa,
  leerBorradores,
  rondaAReabrir,
} from "../RankingModal/borrador";
import {
  buildFilas,
  datosDePartidas,
  emparejarFilas,
  muertosDeFilas,
  personajesSinResolver,
  type CrearTorneoResultado,
} from "../supabase/crearTorneo";
import ErrorConexion from "../ui/ErrorConexion";
import {
  datos,
  describeError,
  type Personaje,
  type PlayerActivity,
  type PlayerLevel,
} from "../data";

export interface PlayerScore {
  role: string | null;
  score: number;
  alive: boolean;
  winner: boolean;
  /**
   * La fila viene de un torneo ya guardado, no de esta sesión.
   *
   * `buildFilas` las excluye del envío, y sólo 🏆 Continue Tournament las marca.
   * De ahí que continuar un torneo tenga que pasar por ese botón.
   */
  imported?: boolean;
  /**
   * Personaje que llevaba en esta ronda, o null/ausente si no se apuntó.
   *
   * Opcional en el tipo porque `playerScores` se guarda en localStorage y lo que
   * hubiera guardado antes de existir el campo no lo trae. Las filas importadas
   * de un torneo ya guardado tampoco: su personaje ya está en la base de datos y
   * no se reenvía.
   *
   * Sólo para mostrar: lo que se guarda es `filaPersonaje`.
   */
  personaje?: string | null;
  /**
   * Fila de characters.xlsx (`Personaje.filaExcel`) del personaje elegido.
   * Al guardar, `buildFilas` la traduce con el catálogo cargado a los seis
   * campos de la carta (codigo, servidor, expansion, version, nombre, nivel).
   * Sin comprobar el nombre, a propósito: el Excel no cambia entre elegir y
   * guardar. Si cambiara, se guardaría la carta que ahora ocupa esa fila.
   */
  filaPersonaje?: number | null;
}
export interface GameScore {
  winner: string | null;
  loyalDeathOnLastRebelDeath: number;
  spyRebelKilled: number;
  spyFinalDuel: boolean;
  spyFinalTrio: boolean;
  /**
   * `partidas.nivel` de esta ronda: lo elige el modal y va tal cual a la base
   * de datos. Null mientras la ronda no se ha enviado con Submit. Es de cada
   * ronda y no de la sesión: alguien puede subir de nivel a mitad del torneo.
   */
  nivel: number | null;
  /** `partidas.is_ranked` de esta ronda. Null mientras no se ha enviado. */
  isRanked: boolean | null;
}

/** Una ronda sin rellenar. */
const gameScoreVacio = (): GameScore => ({
  winner: null,
  loyalDeathOnLastRebelDeath: 0,
  spyRebelKilled: 0,
  spyFinalDuel: false,
  spyFinalTrio: false,
  nivel: null,
  isRanked: null,
});

export interface TournamentData {
  torneoId: string;
  jugadores: string[];
  jugadoresOrdenOriginal: string[];
  maxNumPartida: number;
  numJugadores: number;
  isCompleted: boolean;
  scoringSystem: string | null;
}

/**
 * Semilla del selector: la lista incluida en el bundle.
 *
 * Es la **tercera** línea de defensa, y sólo se ve en un caso: navegador nuevo (o
 * sin datos guardados) y base de datos que no responde. Lo normal es la lista de
 * la base de datos, y si no responde, la de la última conexión guardada en el
 * navegador (ver CACHE_JUGADORES).
 *
 * Duplica `v_jugadores` y por tanto envejece, pero desde que existe la copia del
 * navegador eso ya no tiene consecuencias. Regenerarla, si alguna vez hace falta,
 * con esta consulta (quien haya jugado en el último año):
 *
 *   select json_agg(json_build_object('name', jugador) order by jugador)
 *   from public.v_jugadores_actividad
 *   where ultima_partida > ((now() at time zone 'Europe/Madrid')::date
 *                           - interval '12 months');
 *
 * Al 2026-09-01 son 37 nombres. La anterior llevaba tiempo desviada: le faltaban
 * cinco jugadores activos y tenía un nombre, "Erik", que no existe en
 * `jugadores`, o sea que ofrecía crear un jugador fantasma.
 */
const semillaJugadores: string[] = players.map((player) => player.name);

/** Clave del navegador donde se guarda la última lista leída de la BD. */
const CACHE_JUGADORES = "jugadoresCache-v1";

/**
 * La lista de jugadores tal y como vino de la base de datos, con la fecha.
 *
 * Se guarda la actividad completa y no sólo los nombres para que el filtro de
 * meses siga funcionando sin conexión: filtrar necesita `ultimaPartida`.
 *
 * **Sólo se guardan los jugadores.** Los niveles y los torneos no, a propósito:
 * un nombre viejo es inofensivo (lo caza el aviso de jugadores no registrados, y
 * en último término la clave ajena), pero un nivel viejo propondría un nivel de
 * partida equivocado, que entraría tal cual en `partidas.nivel` sin que nada
 * chille. Cuando no hay conexión, el nivel se comprueba a mano en cada ronda y
 * la pantalla lo dice.
 */
interface CacheJugadores {
  /** ISO del momento en que se leyó. */
  fecha: string;
  jugadores: PlayerActivity[];
}

/**
 * Lee la copia guardada, o null.
 *
 * Defensiva de más a propósito: en modo incógnito `localStorage` puede lanzar, y
 * un JSON de una versión anterior del formato no debe tumbar la pantalla. Ante
 * cualquier duda se devuelve null y se cae en la semilla.
 */
function leerCacheJugadores(): CacheJugadores | null {
  try {
    const crudo = window.localStorage.getItem(CACHE_JUGADORES);
    if (!crudo) return null;
    const cache = JSON.parse(crudo) as CacheJugadores;
    if (typeof cache?.fecha !== "string" || !Array.isArray(cache?.jugadores)) {
      return null;
    }
    return cache.jugadores.length > 0 ? cache : null;
  } catch {
    return null;
  }
}

function escribirCacheJugadores(cache: CacheJugadores): void {
  try {
    window.localStorage.setItem(CACHE_JUGADORES, JSON.stringify(cache));
  } catch {
    // Sin sitio o sin permiso: la copia dura lo que dure la pestaña. Aceptable.
  }
}

/** Fecha de la copia en formato corto, para contarla en el aviso de error. */
function formatearFechaCache(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime())
    ? iso
    : fecha.toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/**
 * Sistema de puntuación con el que se calculan estos puntos.
 *
 * En la base de datos identifica el reglamento vigente de cada torneo, y la
 * validación exige que coincida con el del torneo al continuarlo. Esta pantalla
 * es el "Generador de puntuaciones 2024", así que siempre emite 2024-01-01.
 * Valores históricos: 2011-01-01, 2020-01-01, 2021-04-01, 2024-01-01.
 */
const SCORING_SYSTEM = "2024-01-01";

/*
 * El nivel y el ranked se eligen en el modal de cada ronda y viven en
 * `GameScore.nivel` / `GameScore.isRanked` (ver ./datosRonda.ts). Los niveles
 * válidos (1..15 y 6.5) están en ./niveles.ts.
 */

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

/**
 * Qué bando ganó una ronda, deducido de los roles marcados como ganadores.
 *
 * `GameScore.winner` guarda el bando ("King", "Rebel", "Spy") con los nombres
 * que usa el formulario de la ronda, mientras que las puntuaciones guardan el
 * rol abreviado (R, L, V, A). Al ganar el rey ganan también sus leales, así que
 * una L ganadora es una victoria del bando del rey.
 *
 * Se usa al importar un Raw Data: el texto trae quién ganó, no qué bando, y sin
 * esto reabrir una ronda importada partiría del bando por defecto.
 */
function bandoGanador(ronda: PlayerScore[]): string | null {
  for (const puntuacion of ronda) {
    if (!puntuacion?.winner) continue;
    if (puntuacion.role === "R" || puntuacion.role === "L") return "King";
    if (puntuacion.role === "V") return "Rebel";
    if (puntuacion.role === "A") return "Spy";
  }
  return null;
}

Modal.setAppElement("#root");

const Ranking = () => {
  /*
   * Una única instancia de useAuth() para toda la pantalla. La comparten la
   * cabecera (SesionOrganizador), el bloque de guardar (GuardarPartida) y el
   * modal de ronda (su botón de Telegram). Elevarla aquí evita dos
   * suscripciones a la sesión y dos llamadas a soy_organizador(); no se usa un
   * contexto porque los consumidores son hijos directos.
   */
  const auth = useAuth();

  const [monthsFilter, setMonthsFilter] = useState<number>(3);

  /**
   * De dónde sale la lista del selector: la copia guardada, o null si no hay.
   *
   * Se inicializa leyendo el navegador, así que en un arranque normal el selector
   * ya nace con la lista de la última sesión y no con la del bundle. Se actualiza
   * en cada lectura correcta.
   */
  const [cacheJugadores, setCacheJugadores] = useState<CacheJugadores | null>(
    () => leerCacheJugadores()
  );

  /**
   * Las opciones del selector.
   *
   * Derivadas, no estado: el filtro de meses se aplica aquí sobre los datos ya
   * cargados, así que tocar el número de meses reordena la lista al instante y ya
   * no relanza las tres consultas como antes.
   *
   * **La semilla no se filtra por meses.** Sus nombres no llevan fecha, y si se
   * les pusiera la del día en que se generó el fichero irían cayendo del filtro
   * hasta dejar el selector vacío, que es justo lo contrario de lo que hace falta
   * cuando no hay conexión.
   */
  const playerOptions = useMemo(() => {
    if (cacheJugadores === null) {
      return semillaJugadores.map((nombre) => ({
        value: nombre,
        label: nombre,
      }));
    }

    // Se compara contra "hoy hace N meses" sin tocar la hora, y un jugador sin
    // fecha entra siempre.
    const corte = new Date();
    corte.setMonth(corte.getMonth() - monthsFilter);

    return cacheJugadores.jugadores
      .filter(({ ultimaPartida }) => {
        if (!ultimaPartida) return true;
        const [year, month, day] = ultimaPartida.split("-").map(Number);
        return new Date(year, month - 1, day) >= corte;
      })
      .map(({ nombre }) => ({ value: nombre, label: nombre }));
  }, [cacheJugadores, monthsFilter]);

  /**
   * El fallo de la última lectura, o null. Es lo que dispara el aviso de error.
   */
  const [errorDatos, setErrorDatos] = useState<string | null>(null);
  /**
   * Recarga jugadores, niveles y torneos.
   *
   * Las tres consultas son independientes, así que van en paralelo. Cada una
   * reintenta por su cuenta (ver src/data/index.ts); si alguna acaba fallando,
   * `Promise.all` rechaza y se enseña el aviso con el botón de reintentar. No se
   * aplican resultados parciales a propósito: media pantalla con datos nuevos y
   * media con los viejos es difícil de interpretar cuando lo que se va a hacer
   * con ellos es guardar puntuaciones.
   */
  const refrescarDatos = useCallback(async () => {
    setUpdateStatus("updating");

    try {
      const [actividad, niveles, torneos] = await Promise.all([
        datos.fetchPlayerActivity(),
        datos.fetchPlayerLevels(),
        datos.fetchTournaments(),
      ]);

      // Una respuesta vacía no pisa la copia anterior: sería cambiar una lista
      // buena por un selector vacío. No debería pasar (hay 174 jugadores), pero
      // el precio de la guarda es una línea.
      if (actividad.length > 0) {
        const cache: CacheJugadores = {
          fecha: new Date().toISOString(),
          jugadores: actividad,
        };
        escribirCacheJugadores(cache);
        setCacheJugadores(cache);
      }

      setPlayerLevels(new Map(niveles.map((nivel) => [nivel.nombre, nivel])));
      setTournamentsData(torneos);

      setErrorDatos(null);
      setUpdateStatus("done");
      setTimeout(() => setUpdateStatus("idle"), 2000);
    } catch (error) {
      console.error("No se han podido cargar los datos:", error);
      setErrorDatos(describeError(error));
      setUpdateStatus("idle");
    }
    // Sin dependencias: `fetchPlayerActivity` no recibe el filtro de meses, que
    // se aplica al derivar `playerOptions`. Antes `monthsFilter` estaba aquí y
    // cada pulsación en la casilla de meses relanzaba las tres consultas.
  }, []);

  useEffect(() => {
    refrescarDatos();
  }, [refrescarDatos]);

  /**
   * El catálogo de characters.xlsx, o null mientras no haya llegado.
   *
   * Va aparte del `Promise.all` de arriba a propósito: es un dato opcional (el
   * personaje se puede dejar en blanco), y si su lectura falla no tiene que
   * tumbar niveles y torneos, que sí son necesarios para guardar. Sin catálogo
   * el campo del modal sale deshabilitado y lo dice.
   *
   * Se lee una vez por carga de página, ya que el archivo es estático durante
   * una sesión de juego.
   */
  const [personajes, setPersonajes] = useState<Personaje[] | null>(null);
  useEffect(() => {
    let cancelado = false;
    import("../data/personajes")
      .then(({ cargarPersonajes }) => cargarPersonajes())
      .then((lista) => {
        if (!cancelado) setPersonajes(lista);
      })
      .catch((error) => {
        console.error("No se ha podido cargar el catálogo de personajes:", error);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const [playerChoice, setPlayerChoice] = useLocalStorage<string[]>(
    "playerChoice-v1",
    []
  );
  /*
   * `-v2` desde que el nivel y el ranked son de cada ronda (van en GameScore).
   * Lo guardado con `-v1` se abandona sin convertir: el cambio se desplegó con
   * la web en mantenimiento y todo el mundo empezó de cero. Por lo mismo ya no
   * se usan `gameLevel-v1`, `gameLevelElegidoAMano-v1` ni `isRanked-v1`.
   *
   * `-v3` desde que el personaje se guarda por carta (PlayerScore.filaPersonaje,
   * BD/migration/pg/24). Una ronda `-v2` con personaje no sabría qué carta
   * mandar, así que también se abandona; las dos claves cambian juntas para
   * que playerScores y gameScores no se desalineen.
   */
  const [playerScores, setPlayerScores] = useLocalStorage<PlayerScore[][]>(
    "playerScore-v3",
    []
  );
  const [gameScores, setGameScores] = useLocalStorage<GameScore[]>(
    "gameScore-v3",
    []
  );
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [isOpen, setIsOpen] = React.useState(false);
  const [gameDescription, setGameDescription] = useLocalStorage<string>(
    "gameDescription-v1",
    ""
  );
  const [lastTorneoId, setLastTorneoId] = useLocalStorage<string>(
    "lastTorneoId-v1",
    ""
  );
  const [tournamentsData, setTournamentsData] = useState<TournamentData[]>([]);
  const [tournamentCheckMessage, setTournamentCheckMessage] = useState<string>("");
  const [activeTournament, setActiveTournament] = useState<TournamentData | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'updating' | 'done'>('idle');
  const [originalPlayerOrder, setOriginalPlayerOrder] = useState<string[]>([]);
  const [introductionOrder, setIntroductionOrder] = useState<string[]>([]);
  const [hasBeenRandomized, setHasBeenRandomized] = useState<boolean>(false);
  const [playerLevels, setPlayerLevels] = useState<Map<string, PlayerLevel>>(new Map());
  /**
   * La fecha que traía un Raw Data importado, o null si la partida es de hoy.
   *
   * Sin esto, importar el texto de la sesión de anoche la guardaría con la fecha
   * de hoy: `fechaDeHoy()` se evalúa al pintar. La fecha decide en qué temporada
   * cuenta la partida y alimenta el filtro de meses del informe de niveles, así
   * que no es un detalle cosmético.
   *
   * No se persiste, y se descarta al cambiar la mesa: era la fecha de otra
   * partida.
   */
  const [fechaImportada, setFechaImportada] = useState<string | null>(null);

  /** La fecha de esta partida: la del texto importado, o la de hoy. */
  const fechaPartida = fechaImportada ?? fechaDeHoy();

  /**
   * El nivel automático de la mesa (el mínimo), o null si los niveles de los
   * jugadores no han llegado todavía. Es la semilla del desplegable del modal
   * cuando ninguna ronda anterior trae nivel. Ver ./datosRonda.ts.
   */
  const nivelAutomatico = useMemo(
    () => nivelAutomaticoMesa(playerChoice, playerLevels),
    [playerChoice, playerLevels]
  );

  /** "Puede que hoy suba de nivel": lo pinta el modal, bajo el desplegable. */
  const avisoNivel = useMemo(
    () => calcularAvisoNivel(playerChoice, playerLevels),
    [playerChoice, playerLevels]
  );

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
      // Antes esto sólo iba a la consola y el botón morado no hacía nada
      // visible. Ahora sale el aviso: importar las rondas ya jugadas y no
      // conseguirlo cambia lo que hay que hacer después.
      setErrorDatos(describeError(error));
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

    // Importar las rondas ya jugadas del torneo
    fetchTournamentData(activeTournament.torneoId.toString()).then(tournamentData => {
      if (tournamentData && tournamentData.size > 0) {
        // Crear matriz de puntuaciones para los jugadores actuales
        const maxRound = Math.max(...Array.from(tournamentData.keys()));
        const importedScores: PlayerScore[][] = [];
        const importedGameScores: GameScore[] = [];
        
        for (let round = 1; round <= maxRound; round++) {
          const roundData = tournamentData.get(round);
          if (roundData) {
            // Nivel y ranked son de la partida: el mismo en todas sus celdas.
            const unaCelda = roundData.values().next().value;
            const roundScores: PlayerScore[] = tournamentOrder.map(player => {
              const playerData = roundData.get(player);
              if (playerData) {
                return {
                  role: playerData.role,
                  score: playerData.score,
                  alive: true, // Por defecto, asumimos que están vivos
                  winner: playerData.winner,
                  imported: true // Ya está en la base de datos: no reenviarla
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
            
            // GameScore de la ronda ya jugada. Su nivel y su ranked son los que
            // heredará la ronda siguiente al abrir el modal.
            importedGameScores.push({
              ...gameScoreVacio(),
              nivel: unaCelda?.nivel ?? null,
              isRanked: unaCelda?.isRanked ?? null,
            });
          }
        }
        
        // Actualizar los scores con los datos importados
        if (importedScores.length > 0) {
          setPlayerScores(importedScores);
          setGameScores(importedGameScores);
        }
      }
    });
  }

  // Verificar historial de torneos cuando cambian los jugadores
  useEffect(() => {
    checkTournamentHistory(playerChoice);
  }, [playerChoice, checkTournamentHistory]);

  /** El campo es un input de texto: sólo vale como id un entero positivo. */
  const torneoIdParaBD = useMemo(() => {
    const n = parseInt(lastTorneoId, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [lastTorneoId]);

  /**
   * Las filas que se enviarán a la base de datos. Memoizadas para que
   * GuardarPartida pueda detectar por contenido si los datos han cambiado.
   */
  const filasParaBD = useMemo(
    () => buildFilas(playerScores, playerChoice, personajes),
    [playerScores, playerChoice, personajes]
  );

  /** Personajes apuntados que no se pueden traducir a carta: impiden guardar. */
  const sinResolver = useMemo(
    () => personajesSinResolver(playerScores, playerChoice, personajes),
    [playerScores, playerChoice, personajes]
  );

  /**
   * Nivel y ranked de cada ronda que se va a enviar, sacados de las filas (ver
   * `datosDePartidas`). De aquí salen el payload, el Raw Data y el resumen.
   */
  const datosPartidas = useMemo(
    () => datosDePartidas(filasParaBD, (n) => gameScores[n - 1]),
    [filasParaBD, gameScores]
  );

  /**
   * Quién murió en cada ronda, para el aviso de Telegram. Sale de las mismas
   * filas que todo lo demás (emparejarFilas trae `vive`), así que las filas
   * importadas quedan fuera igual que en el envío. La muerte no se guarda; es
   * sólo contexto en el mensaje.
   */
  const muertos = useMemo(
    () => muertosDeFilas(emparejarFilas(playerScores, playerChoice)),
    [playerScores, playerChoice]
  );

  /**
   * La partida en el formato que se comparte. Ver ./formatoRawData.ts.
   *
   * Las filas salen de `emparejarFilas`, de donde salen también las de
   * `filasParaBD`: el texto describe exactamente lo que se insertaría, y por eso
   * un organizador puede pegarlo y guardar sin volver a apuntar nada.
   */
  const rawData = useMemo<RawDataPartida>(
    () => ({
      fecha: fechaPartida,
      scoringSystem: SCORING_SYSTEM,
      torneoId: torneoIdParaBD,
      descripcion: gameDescription,
      jugadores: playerChoice,
      rondas: datosPartidas.partidas.map((p) => ({
        numPartida: p.num_partida,
        nivel: p.nivel,
        isRanked: p.is_ranked,
      })),
      filas: emparejarFilas(playerScores, playerChoice).map((fila) => ({
        numPartida: fila.num_partida,
        jugador: fila.jugador,
        rol: fila.rol,
        puntos: fila.puntos,
        gana: fila.ganada,
        vive: fila.vive,
      })),
    }),
    [
      datosPartidas,
      fechaPartida,
      gameDescription,
      playerChoice,
      playerScores,
      torneoIdParaBD,
    ]
  );

  /**
   * El texto del bloque de Raw data.
   *
   * Es un `useMemo` y no un estado: antes era `useState` más un efecto más una
   * llamada a `setRawText` en cada sitio que tocaba las puntuaciones, y esas
   * llamadas tenían que pasarle a mano los valores nuevos porque el estado
   * todavía no se había actualizado. Cualquier camino nuevo que se olvidara de
   * llamarla dejaba el texto desfasado sin que se notara. Derivarlo hace que eso
   * no se pueda dar.
   */
  const rawText = useMemo(() => formatRawData(rawData), [rawData]);

  /**
   * Carga en la pantalla una partida que llega en un Raw Data.
   *
   * Sustituye la mesa entera, no la fusiona: el texto trae el orden de asiento y
   * las rondas completas, y mezclarlo con lo que hubiera en pantalla daría una
   * partida que no es ninguna de las dos.
   *
   * Las filas se colocan en el índice de su `num_partida`, no una detrás de
   * otra: si el texto sólo trae la ronda 2 (una continuación), la ronda 1 tiene
   * que quedar vacía para que `buildFilas` vuelva a emitir `num_partida` 2.
   */
  const importarRawData = useCallback(
    (partida: RawDataPartida) => {
      const jugadores = partida.jugadores;
      const vacia = (): PlayerScore => ({
        role: null,
        score: 0,
        alive: true,
        winner: false,
        imported: false,
      });

      // La tabla pinta tantas rondas como jugadores; si el texto trae más (no
      // debería), no se pierden.
      const numRondas = partida.filas.reduce(
        (max, fila) => Math.max(max, fila.numPartida),
        jugadores.length
      );
      const scores: PlayerScore[][] = Array.from({ length: numRondas }, () =>
        jugadores.map(vacia)
      );

      const indice = new Map(jugadores.map((nombre, i) => [nombre, i]));
      for (const fila of partida.filas) {
        const columna = indice.get(fila.jugador);
        if (columna === undefined) continue;
        scores[fila.numPartida - 1][columna] = {
          role: fila.rol,
          score: fila.puntos,
          alive: fila.vive,
          winner: fila.gana,
          // Se envían a la base de datos: es justo lo que se viene a hacer.
          imported: false,
        };
      }

      // El resto de GameScore (muertes de leales, duelo final...) no viaja en el
      // texto: son datos de entrada del cálculo, y los puntos ya están
      // calculados. Se reconstruye el bando ganador, que se deduce de los roles,
      // para que reabrir una ronda parta del bando correcto; y el nivel y el
      // ranked de cada ronda, que sí viajan y van tal cual a la base de datos.
      const datosRonda = new Map(partida.rondas.map((r) => [r.numPartida, r]));
      const games: GameScore[] = scores.map((ronda, i) => ({
        ...gameScoreVacio(),
        winner: bandoGanador(ronda),
        nivel: datosRonda.get(i + 1)?.nivel ?? null,
        isRanked: datosRonda.get(i + 1)?.isRanked ?? null,
      }));

      setPlayerChoice(jugadores);
      setPlayerScores(scores);
      setGameScores(games);
      setIntroductionOrder(jugadores);
      setOriginalPlayerOrder([]);
      setHasBeenRandomized(false);
      setGameDescription(partida.descripcion);
      setLastTorneoId(partida.torneoId === null ? "" : String(partida.torneoId));
      setFechaImportada(partida.fecha);
    },
    [
      setGameDescription,
      setGameScores,
      setLastTorneoId,
      setPlayerChoice,
      setPlayerScores,
    ]
  );

  const handleGuardado = useCallback(
    (resultado: CrearTorneoResultado) => {
      // Apuntar el torneo recién creado para que las rondas siguientes se
      // añadan a él en lugar de abrir otro. Es lo que antes había que copiar a
      // mano en "Continuación de torneo".
      setLastTorneoId(String(resultado.torneo_id));
    },
    [setLastTorneoId]
  );

  /*
   * Tras una recarga (el móvil descartó la pestaña en standby), reabrir el
   * modal que estaba abierto, con su borrador. Sólo al montar, y sólo si el
   * borrador sigue siendo de esta mesa y de esta ronda (ver ../RankingModal/
   * borrador.ts). Sin dependencias a propósito: más tarde, abrir y cerrar el
   * modal es cosa del usuario.
   */
  useEffect(() => {
    if (playerChoice.length < 5 || playerChoice.length > 10) return;
    const ronda = rondaAReabrir(
      leerBorradores(),
      firmaMesa(playerChoice),
      (r) => baseDeRonda(playerChoice, playerScores[r - 1], gameScores[r - 1]),
      new Date()
    );
    if (ronda !== null && ronda >= 1 && ronda <= playerChoice.length) {
      setCurrentRound(ronda);
      setIsOpen(true);
    }
  }, []);

  function openModal(round: number) {
    setCurrentRound(round);
    setIsOpen(true);
  }

  function closeModal() {
    // Cancel y clic fuera: el borrador de la ronda se conserva (reabrirla lo
    // recupera), pero ya no se reabre solo al recargar.
    escribirBorradores(cerrado(leerBorradores()));
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
    }
    // gameScores puede ser más corto que playerScores (datos de antes, o una
    // importación): se alarga por separado para que el ganador, el nivel y el
    // ranked de esta ronda no se pierdan.
    while (newGameScores.length < currentRound) {
      newGameScores.push(gameScoreVacio());
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
    
    // Limpiar las filas ya guardadas del torneo
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
  }

  function handleRestoreOriginalOrder() {
    // Usar el orden de introducción del componente en lugar del orden guardado
    // Filtrar introductionOrder para incluir solo los jugadores actuales
    const filteredIntroductionOrder = introductionOrder.filter(player => playerChoice.includes(player));
    const orderToRestore = filteredIntroductionOrder.length > 0 ? filteredIntroductionOrder : originalPlayerOrder;
    if (orderToRestore.length === 0) return;
    
    // Limpiar las filas ya guardadas del torneo
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
  }

  return (
    <div className="Ranking-component">
      <Navbar />
      <h1 className="text-3xl font-bold underline m-6">Generador de puntuaciones 2024-2026</h1>
      <SesionOrganizador auth={auth} />
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
      {/* El nivel y el ranked ya no van aquí: se eligen en cada ronda. */}
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
          title="Volver a leer jugadores, niveles y torneos de la base de datos"
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
        La base de datos no responde.

        Se enumera qué deja de funcionar en lugar de dejarlo en "ha habido un
        error", porque esta pantalla sigue siendo usable sin base de datos y lo
        que no hay que hacer es guardar a ciegas: sin niveles el desplegable no
        se autocalcula, y sin torneos no hay comprobación de mesa repetida ni
        botón para continuar. La salida es la de siempre, el bloque de SQL.
      */}
      {errorDatos !== null && (
        <div className="mx-auto max-w-2xl">
          <ErrorConexion
            que="los jugadores, los niveles y los torneos"
            detalle={errorDatos}
            onReintentar={refrescarDatos}
            reintentando={updateStatus === 'updating'}
          >
            <p>
              Puedes seguir apuntando la partida y copiar el bloque de SQL del
              final, pero <strong>no</strong> se podrá guardar en la base de datos
              hasta que vuelva.
            </p>
            <ul className="mt-1 list-disc pl-5">
              <li>
                {cacheJugadores === null ? (
                  <>
                    La lista de jugadores es la que viene incluida en la web, y no
                    se ha llegado a leer ninguna de la base de datos en este
                    navegador: puede estar desfasada.
                  </>
                ) : (
                  <>
                    La lista de jugadores es la de la última conexión, del{" "}
                    {formatearFechaCache(cacheJugadores.fecha)}. Si alguien ha
                    debutado después, no saldrá.
                  </>
                )}
              </li>
              <li>
                El nivel de la partida no se autocalcula:{" "}
                <strong>compruébalo a mano en cada ronda</strong>, en el
                desplegable del modal.
              </li>
              <li>
                No se avisa si esta mesa ya jugó un torneo junta, y no se puede
                continuar un torneo existente.
              </li>
            </ul>
          </ErrorConexion>
        </div>
      )}
      {/*
        Importar un Raw Data va aquí, antes del selector, porque cargar
        reconstruye la mesa desde cero: el orden de la pantalla es el orden en
        que se hacen las cosas.
      */}
      <ImportarRawData
        sistemaEsperado={SCORING_SYSTEM}
        nivelesValidos={NIVELES_PARTIDA}
        hayDatos={filasParaBD.length > 0}
        onImportar={importarRawData}
      />
      <CreatableSelect
        isMulti
        isSearchable={true}
        isOptionDisabled={() => playerChoice.length >= 10}
        options={playerOptions}
        /*
          Controlado (`value`) y no `defaultValue`.

          `defaultValue` sólo se lee al montar, así que el selector no reflejaba
          los cambios de `playerChoice` hechos desde el código: continuar un
          torneo reordenaba la mesa y las etiquetas seguían en el orden viejo. Con
          la importación de Raw Data eso pasa de ser un detalle a un problema:
          cargar una partida cambia los jugadores enteros y el selector se
          quedaría enseñando los anteriores.
        */
        value={playerChoice.map((player) => ({
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
          
          // Cambiar la mesa descarta la fecha que trajera un Raw Data
          // importado: era de otra partida. El nivel y el ranked se van con
          // las rondas, que se vacían aquí abajo.
          setFechaImportada(null);
          
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
            Array.from({ length: selectedValues.length }, gameScoreVacio)
          );
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
      {/*
        El nivel de la partida ya no se elige aquí sino en el modal de cada
        ronda, con su aviso de "puede que hoy suba de nivel".
      */}
      <div className="flex items-center justify-center mt-2">
        <label htmlFor="lastTorneoId" className="text-sm font-medium">
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
                      Game
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
                        {playerScores[index]?.[playerIndex]?.role &&
                          playerScores[index][playerIndex]?.personaje && (
                            <div className="text-xs font-normal text-gray-600">
                              {playerScores[index][playerIndex].personaje}
                            </div>
                          )}
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
            <GuardarPartida
              auth={auth}
              filas={filasParaBD}
              muertos={muertos}
              jugadores={playerChoice}
              torneoId={torneoIdParaBD}
              descripcion={gameDescription}
              /* La del Raw Data importado si hay uno; si no, la de hoy. */
              fecha={fechaPartida}
              scoringSystem={SCORING_SYSTEM}
              partidas={datosPartidas.partidas}
              rondasIncompletas={datosPartidas.incompletas}
              personajesSinResolver={sinResolver}
              catalogoCargado={personajes !== null}
              onGuardado={handleGuardado}
            />
            <RawData texto={rawText} vacio={filasParaBD.length === 0} />
          </>
        )}
        <Modal
          isOpen={isOpen}
          onRequestClose={closeModal}
          contentLabel="Game Modal"
          // Con clases propias react-modal no pone sus estilos en línea (un
          // recuadro con inset de 40px que no cabía en el móvil). El diseño
          // está en ../RankingModal/RankingModal.css.
          className="rm-content"
          overlayClassName="rm-overlay"
        >
          <RankingModal
            // Un montaje por ronda: el modal lee su borrador al montarse.
            key={currentRound}
            auth={auth}
            personajes={personajes}
            valoresIniciales={valoresInicialesRonda(
              gameScores,
              currentRound,
              nivelAutomatico
            )}
            nivelAutomatico={nivelAutomatico}
            avisoNivel={avisoNivel}
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

export default Ranking;
