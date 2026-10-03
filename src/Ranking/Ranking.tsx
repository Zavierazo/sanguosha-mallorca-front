import React, { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../Navbar";
import CreatableSelect from "react-select/creatable";
import Modal from "react-modal";
import players from "./players.json";
import RankingModal from "../RankingModal";
import { useLocalStorage } from "@uidotdev/usehooks";
import GuardarPartida from "./GuardarPartida";
import RawData from "./RawData";
import ImportarRawData from "./ImportarRawData";
import { formatRawData, type RawDataPartida } from "./formatoRawData";
import {
  esNivelPartida,
  NIVEL_MAXIMO,
  NIVEL_MINIMO,
  NIVELES_PARTIDA,
  siguienteNivelEntero,
} from "./niveles";
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
  emparejarFilas,
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
   */
  personaje?: string | null;
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
 * en último término la clave ajena), pero un nivel viejo entraría tal cual en
 * `partidas.nivel` y sería un dato mal guardado sin que nada chille. Cuando no
 * hay conexión, el nivel se comprueba a mano y la pantalla lo dice.
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
 * Los niveles de partida válidos (1..15 y 6.5) viven en ./niveles.ts.
 *
 * Ojo: el valor inicial de `gameLevel`, el caso "sin jugadores" de
 * `calculateMinLevel` y las opciones del desplegable salen todos de ahí. Un
 * `gameLevel` que no esté en NIVELES_PARTIDA no marcaría ninguna opción, el
 * navegador pintaría la primera y se guardaría un valor distinto del que se ve.
 */

/** `partidas.nivel` es numeric: 9.0 debe verse "9", pero existe el nivel 6.5. */
const formatearNivel = (nivel: number): string => String(Number(nivel));

/** "Alig", "Alig y Han Jin", "Alig, Han Jin y Miquel". */
const listarNombres = (nombres: string[]): string =>
  nombres.length <= 1
    ? nombres.join("")
    : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;

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
   * El catálogo de personajes, o null mientras no haya llegado.
   *
   * Va aparte del `Promise.all` de arriba a propósito: es un dato opcional (el
   * personaje se puede dejar en blanco), y si su lectura falla no tiene que
   * tumbar niveles y torneos, que sí son necesarios para guardar. Sin catálogo
   * el campo del modal sale deshabilitado y lo dice.
   *
   * Se lee una vez por carga de página: sólo cambia cuando alguien recarga la
   * tabla desde el editor SQL, y eso no pasa en mitad de una sesión de juego.
   */
  const [personajes, setPersonajes] = useState<Personaje[] | null>(null);
  useEffect(() => {
    let cancelado = false;
    datos
      .fetchPersonajes()
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
  /*
   * En localStorage: el nivel es lo que va a `partidas.nivel`, y una recarga
   * (el móvil en standby durante la partida) no puede cambiarlo por detrás.
   * Un valor guardado que no sea una opción del desplegable (versión vieja,
   * a mano) se trata como el mínimo: si no, el desplegable no marcaría ninguna
   * opción y se guardaría un valor distinto del que se ve.
   */
  const [gameLevelGuardado, setGameLevel] = useLocalStorage<number>(
    "gameLevel-v1",
    NIVEL_MINIMO
  );
  const gameLevel = esNivelPartida(gameLevelGuardado) ? Number(gameLevelGuardado) : NIVEL_MINIMO;
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
  const [playerLevels, setPlayerLevels] = useState<Map<string, PlayerLevel>>(new Map());
  /**
   * Si alguien ha tocado el desplegable de nivel a mano.
   *
   * Existe para que el recálculo automático no le pise la elección. Se guarda
   * en localStorage junto con el nivel: antes no se persistía, y una recarga a
   * mitad de partida devolvía el nivel al automático en silencio. Cambiar la
   * mesa sigue poniéndolo a false.
   */
  const [gameLevelElegidoAMano, setGameLevelElegidoAMano] = useLocalStorage<boolean>(
    "gameLevelElegidoAMano-v1",
    false
  );
  /**
   * La fecha que traía un Raw Data importado, o null si la partida es de hoy.
   *
   * Sin esto, importar el texto de la sesión de anoche la guardaría con la fecha
   * de hoy: `fechaDeHoy()` se evalúa al pintar. La fecha decide en qué temporada
   * cuenta la partida y alimenta el filtro de meses del informe de niveles, así
   * que no es un detalle cosmético.
   *
   * No se persiste, y se descarta al cambiar la mesa, por lo mismo que
   * `gameLevelElegidoAMano`: era la fecha de otra partida.
   */
  const [fechaImportada, setFechaImportada] = useState<string | null>(null);

  /** La fecha de esta partida: la del texto importado, o la de hoy. */
  const fechaPartida = fechaImportada ?? fechaDeHoy();

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
    const levels = players.map(
      (player) => playerLevels.get(player)?.nivel ?? NIVEL_MINIMO
    );
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

  /**
   * El nivel que el cálculo automático propone para esta mesa.
   *
   * Es lo mismo que se le pone al desplegable, pero se necesita aparte: el
   * aviso de abajo tiene que hablar del nivel de la mesa aunque alguien haya
   * movido el desplegable a mano.
   */
  const nivelMesa = useMemo(
    () => calculateMinLevel(playerChoice),
    [calculateMinLevel, playerChoice]
  );

  /**
   * Aviso de "puede que esta partida haga subir de nivel". Null si no procede.
   *
   * El nivel que propone `calculateMinLevel` es `max_nivel_jugado`: lo que el
   * jugador ha jugado, no lo que se ha ganado. Cuando alguien ha desbloqueado
   * por experiencia un nivel que todavía no ha jugado, puede subir en cualquier
   * momento y nadie sabe si es hoy, así que el número del desplegable es una
   * conjetura y hay que preguntar. Esa condición es exactamente
   * `nivel_desbloqueado > max_nivel_jugado`, que es el `completo` de
   * `v_nivel_jugadores`, el 100 % verde del informe "Nivel jugadores" (ver
   * BD/migration/pg/09_v_nivel_jugadores.sql). Comprobado contra los datos: 0
   * discrepancias entre las dos formas de calcularlo.
   *
   * Tres decisiones que no son adivinables:
   *
   *   - Tienen que estar listos **todos** los que empatan en el mínimo, no uno.
   *     Si B también está a nivel 7 y no ha desbloqueado el 8, la mesa se juega
   *     a 7 y no hay nada que decidir: avisar ahí sería ruido. Y subir el nivel
   *     ascendería a B sin haberlo ganado, porque el paso 5 de `crear_torneo`
   *     sube `jugadores.nivel` al nivel de la partida.
   *
   *   - Se propone **un escalón**, no el nivel desbloqueado. Los dos números
   *     pueden estar muy separados: hay jugadores con 9 jugado y 15
   *     desbloqueado, y proponer 15 no tiene sentido. El desbloqueado se enseña
   *     como dato, y el escalón se acota a él (con un nivel .5 jugado, +1 se
   *     pasaría de largo) y a NIVEL_MAXIMO.
   *
   *   - `nivelDesbloqueado` undefined es "esta fuente no lo sabe" (Google
   *     Sheets) y null es "no ha desbloqueado nada": en los dos casos no se
   *     afirma nada. Con `nivel` null tampoco. Es la semántica de la base de
   *     datos: `nivel_desbloqueado > max_nivel_jugado` con un NULL no es falso,
   *     es desconocido, y `completo` sale NULL.
   */
  const avisoNivel = useMemo(() => {
    if (playerChoice.length === 0 || playerLevels.size === 0) return null;

    const enElMinimo = playerChoice.filter(
      (player) => (playerLevels.get(player)?.nivel ?? NIVEL_MINIMO) === nivelMesa
    );

    const listos: { nombre: string; desbloqueado: number }[] = [];
    for (const nombre of enElMinimo) {
      const fila = playerLevels.get(nombre);
      const desbloqueado = fila?.nivelDesbloqueado;
      if (!fila || fila.nivel === null) continue;
      if (desbloqueado === null || desbloqueado === undefined) continue;
      if (desbloqueado > fila.nivel) listos.push({ nombre, desbloqueado });
    }
    if (listos.length === 0 || listos.length !== enElMinimo.length) return null;

    const desbloqueado = Math.min(...listos.map((l) => l.desbloqueado));
    const uno = listos.length === 1;
    return {
      jugadores: listos.map((l) => l.nombre),
      desbloqueado,
      // El siguiente ENTERO: el 6.5 no cuenta como escalón (los niveles que se
      // desbloquean por experiencia son enteros), así que desde 6 y desde 6.5
      // se propone el 7. Con nivelMesa = 15 no se llega aquí: nadie desbloquea
      // por encima del máximo.
      siguiente: Math.min(
        NIVEL_MAXIMO,
        desbloqueado,
        siguienteNivelEntero(nivelMesa) ?? NIVEL_MAXIMO
      ),
      // La concordancia se resuelve aquí y no en el JSX: intercalar
      // condicionales en el texto acaba comiéndose los espacios.
      verbos: {
        marcar: uno ? "marca" : "marcan",
        estar: uno ? "está" : "están",
        tener: uno ? "tiene" : "tienen",
        subir: uno ? "sube" : "suben",
      },
    };
  }, [playerChoice, playerLevels, nivelMesa]);

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
    () => buildFilas(playerScores, playerChoice),
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
      nivel: gameLevel,
      isRanked,
      descripcion: gameDescription,
      jugadores: playerChoice,
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
      fechaPartida,
      gameDescription,
      gameLevel,
      isRanked,
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
      // calculados. Sólo se reconstruye el bando ganador, que sí se deduce de
      // los roles, para que reabrir una ronda parta del bando correcto.
      const games: GameScore[] = scores.map((ronda) => ({
        winner: bandoGanador(ronda),
        loyalDeathOnLastRebelDeath: 0,
        spyRebelKilled: 0,
        spyFinalDuel: false,
        spyFinalTrio: false,
      }));

      setPlayerChoice(jugadores);
      setPlayerScores(scores);
      setGameScores(games);
      setIntroductionOrder(jugadores);
      setOriginalPlayerOrder([]);
      setHasBeenRandomized(false);
      setGameDescription(partida.descripcion);
      setIsRanked(partida.isRanked);
      setLastTorneoId(partida.torneoId === null ? "" : String(partida.torneoId));
      setFechaImportada(partida.fecha);
      // El nivel del texto es el de la partida que ya se jugó, así que manda
      // sobre el cálculo automático: sin esto, el efecto de recálculo lo
      // pisaría en cuanto lleguen los niveles de los jugadores.
      setGameLevelElegidoAMano(true);
      setGameLevel(partida.nivel);
    },
    [
      setGameDescription,
      setGameScores,
      setIsRanked,
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
                <strong>compruébalo a mano</strong> en el desplegable.
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
          
          // Auto-seleccionar el nivel mínimo de los jugadores. Cambiar la mesa
          // descarta el nivel que se hubiera puesto a mano, y la fecha que
          // trajera un Raw Data importado: eran de otra partida.
          setGameLevelElegidoAMano(false);
          setGameLevel(calculateMinLevel(selectedValues));
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
            new Array<GameScore>(selectedValues.length).fill({
              winner: null,
              loyalDeathOnLastRebelDeath: 0,
              spyRebelKilled: 0,
              spyFinalDuel: false,
              spyFinalTrio: false,
            })
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
          {NIVELES_PARTIDA.map((nivel) => (
            <option key={nivel} value={nivel}>
              {formatearNivel(nivel)}
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
      {/*
        Aviso de "puede que hoy suba de nivel".

        Sólo informa: el desplegable sigue siendo la única fuente de
        `partidas.nivel`, así que quien decide es la persona. Desaparece en
        cuanto el desplegable llega al nivel siguiente, que es la forma de
        contestar "sí, hoy sube"; contestar "no" es dejarlo como está, y eso no
        se puede distinguir de no haberlo leído, así que el aviso se queda.

        role="status" y no "alert": no es un error, y el texto lleva el aviso
        escrito, no sólo el color de fondo.
      */}
      {avisoNivel !== null && gameLevel < avisoNivel.siguiente && (
        <p
          role="status"
          className="mt-2 mx-auto max-w-2xl rounded border border-yellow-300 bg-yellow-100 p-2 text-sm text-yellow-800"
        >
          ⚠️ {listarNombres(avisoNivel.jugadores)} {avisoNivel.verbos.marcar} el
          nivel de la mesa ({formatearNivel(nivelMesa)}) y {avisoNivel.verbos.estar}{" "}
          al 100 % de experiencia: {avisoNivel.verbos.tener} desbloqueado al menos
          el nivel {formatearNivel(avisoNivel.desbloqueado)} sin haberlo jugado.
          Comprueba
          si esta partida es de nivel {formatearNivel(nivelMesa)} o si en ella{" "}
          {avisoNivel.verbos.subir} a {formatearNivel(avisoNivel.siguiente)}, y
          ajusta el desplegable.
        </p>
      )}
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
              filas={filasParaBD}
              jugadores={playerChoice}
              torneoId={torneoIdParaBD}
              descripcion={gameDescription}
              /* La del Raw Data importado si hay uno; si no, la de hoy. */
              fecha={fechaPartida}
              scoringSystem={SCORING_SYSTEM}
              nivel={gameLevel}
              isRanked={isRanked}
              onGuardado={handleGuardado}
            />
            <RawData texto={rawText} vacio={filasParaBD.length === 0} />
          </>
        )}
        <Modal
          isOpen={isOpen}
          onRequestClose={closeModal}
          contentLabel="Round Modal"
          // Con clases propias react-modal no pone sus estilos en línea (un
          // recuadro con inset de 40px que no cabía en el móvil). El diseño
          // está en ../RankingModal/RankingModal.css.
          className="rm-content"
          overlayClassName="rm-overlay"
        >
          <RankingModal
            // Un montaje por ronda: el modal lee su borrador al montarse.
            key={currentRound}
            personajes={personajes}
            nivel={gameLevel}
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
