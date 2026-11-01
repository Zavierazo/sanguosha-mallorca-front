import { getSupabase } from "./client";
import type { PlayerScore } from "../Ranking/Ranking";

/** Una fila de puntuaciones, tal cual las espera crear_torneo(). */
export interface FilaPuntuacion {
  num_partida: number;
  jugador: string;
  rol: string;
  puntos: number;
  ganada: boolean;
  /**
   * Personaje que llevaba, o null si no se apuntó. crear_torneo() rechaza un
   * nombre que no esté en `public.personajes` y guarda la grafía del catálogo.
   */
  personaje: string | null;
}

/**
 * Lo que es de cada partida y no de cada jugador: va a `public.partidas`.
 *
 * Desde BD/migration/pg/23_datos_por_partida.sql, crear_torneo() exige una
 * entrada por cada `num_partida` de `filas`, ni una más ni una menos, y ya no
 * lee `nivel` ni `is_ranked` de la raíz del payload.
 */
export interface PartidaPayload {
  num_partida: number;
  nivel: number;
  is_ranked: boolean;
}

export interface CrearTorneoPayload {
  /** null crea un torneo nuevo; un id continúa uno existente. */
  torneo_id: number | null;
  descripcion: string;
  fecha: string;
  scoring_system: string;
  partidas: PartidaPayload[];
  filas: FilaPuntuacion[];
}

/** Lo que devuelve crear_torneo(): el equivalente a los SELECT finales del script. */
export interface CrearTorneoResultado {
  torneo_id: number;
  torneo_creado: boolean;
  descripcion: string | null;
  fecha: string;
  scoring_system: string;
  /** Los números de partida insertados. Es lo que recibe avisarPartida(). */
  partidas: number[];
  /** Lo que quedó guardado de cada una. */
  partidas_detalle: PartidaPayload[];
  puntuaciones_insertadas: number;
  jugadores_creados: string[];
}

/** El nivel y el ranked que la pantalla tiene apuntados para una ronda. */
export interface DatosRonda {
  nivel: number | null | undefined;
  isRanked: boolean | null | undefined;
}

export interface DatosDePartidas {
  partidas: PartidaPayload[];
  /** Rondas con filas pero sin nivel o sin ranked: no se puede guardar. */
  incompletas: number[];
}

/**
 * Nivel y ranked de cada partida que se va a enviar.
 *
 * La lista sale de los `num_partida` de las FILAS, no de recorrer todas las
 * rondas de la pantalla. Es lo que hace que una ronda importada con Continue
 * Tournament (que `buildFilas` descarta) no se reenvíe como partida: si se
 * enviara, crear_torneo() la rechazaría por "ronda con nivel pero ninguna
 * puntuación", o por "ya tiene registrada la partida".
 *
 * Una ronda sin nivel o sin ranked va a `incompletas` en vez de rellenarse con
 * un valor por defecto: el nivel multiplica la experiencia de toda la mesa, y
 * un valor inventado entraría en la base de datos sin que nadie lo note.
 */
export function datosDePartidas(
  filas: readonly { num_partida: number }[],
  datosDe: (numPartida: number) => DatosRonda | null | undefined
): DatosDePartidas {
  const numeros = Array.from(new Set(filas.map((f) => f.num_partida))).sort(
    (a, b) => a - b
  );
  const partidas: PartidaPayload[] = [];
  const incompletas: number[] = [];

  for (const num_partida of numeros) {
    const datos = datosDe(num_partida);
    const nivel = datos?.nivel;
    const isRanked = datos?.isRanked;
    if (
      typeof nivel !== "number" ||
      !Number.isFinite(nivel) ||
      typeof isRanked !== "boolean"
    ) {
      incompletas.push(num_partida);
      continue;
    }
    partidas.push({ num_partida, nivel, is_ranked: isRanked });
  }

  return { partidas, incompletas };
}

/**
 * Una fila con lo que la base de datos no guarda pero la pantalla sí muestra.
 *
 * `vive` no existe en `puntuaciones`: quién sobrevivió sólo se usa para calcular
 * los puntos (y ya están calculados) y para pintar el nombre en rojo. Va aparte
 * de `FilaPuntuacion` para que no pueda colarse en el payload de crear_torneo().
 */
export interface FilaPuntuacionDetalle extends FilaPuntuacion {
  vive: boolean;
}

/**
 * Convierte la matriz ronda x jugador del componente en filas.
 *
 * El emparejamiento nombre-puntuación se hace ANTES de filtrar. Si se filtra
 * primero, el índice que llega al map es el del array ya filtrado y los nombres
 * se desplazan: en un torneo continuado, donde las filas ya guardadas se
 * descartan, los puntos acabarían asignados al jugador equivocado.
 *
 * Es la ÚNICA implementación de ese emparejado, y de ahí salen las tres salidas
 * de la pantalla: el envío a la base de datos, el bloque de Raw Data que se
 * comparte y el resumen de "qué se va a guardar". Así no pueden divergir.
 */
export function emparejarFilas(
  playerScores: PlayerScore[][],
  players: string[]
): FilaPuntuacionDetalle[] {
  return playerScores.flatMap((round, roundIndex) =>
    (round ?? [])
      .map((score, playerIndex) => ({ score, jugador: players[playerIndex] }))
      .filter(
        ({ score, jugador }) =>
          Boolean(jugador) &&
          score != null &&
          score.role !== null &&
          !score.imported
      )
      .map(({ score, jugador }) => ({
        num_partida: roundIndex + 1,
        jugador,
        rol: score.role as string,
        puntos: score.score,
        ganada: Boolean(score.winner),
        // `?.trim() || null`: los datos guardados en localStorage antes de que
        // existiera el campo no lo traen, y una cadena vacía es "sin apuntar".
        personaje: score.personaje?.trim() || null,
        vive: score.alive !== false,
      }))
  );
}

/** Las mismas filas, con sólo las columnas que acepta crear_torneo(). */
export function buildFilas(
  playerScores: PlayerScore[][],
  players: string[]
): FilaPuntuacion[] {
  return emparejarFilas(playerScores, players).map(
    ({ num_partida, jugador, rol, puntos, ganada, personaje }) => ({
      num_partida,
      jugador,
      rol,
      puntos,
      ganada,
      personaje,
    })
  );
}

/**
 * Qué nombres del lote no están en la tabla de jugadores.
 *
 * El selector de la página permite teclear nombres nuevos, así que una errata
 * ("Miqel") crearía un jugador y sus puntos desaparecerían del ranking real.
 * crear_torneo() se niega en ese caso, pero conviene avisar antes de que el
 * usuario le dé al botón.
 *
 * La comparación ignora mayúsculas porque la columna es citext: en la base de
 * datos 'AliG' y 'Alig' son el mismo jugador, y aquí tiene que serlo también.
 */
export async function jugadoresDesconocidos(
  nombres: string[]
): Promise<string[]> {
  const buscados = Array.from(
    new Map(
      nombres
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((n) => [n.toLocaleLowerCase(), n])
    ).values()
  );

  if (buscados.length === 0) return [];

  const { data, error } = await getSupabase()
    .from("v_jugadores")
    .select("nombre");

  if (error) throw new Error(error.message);

  const conocidos = new Set(
    (data ?? [])
      .map((row) => row.nombre)
      .filter((n): n is string => Boolean(n))
      .map((n) => n.trim().toLocaleLowerCase())
  );

  return buscados.filter((n) => !conocidos.has(n.toLocaleLowerCase()));
}

/** Un jugador que murió en una ronda. Sólo para pintar "muere" en el aviso. */
export interface MuertoAviso {
  num_partida: number;
  jugador: string;
}

/**
 * Avisa al grupo de Telegram de que se acaba de guardar una partida.
 *
 * El id del torneo y los números de partida son la parte que la Edge Function
 * recompone leyendo la base de datos: jugadores, roles, puntos y quién insertó
 * salen de las tablas, no del navegador, para que quien inserta no pueda
 * guardar una cosa y anunciar otra.
 *
 * `muertos` es la excepción, y a propósito: quién sobrevivió **no se guarda** en
 * `puntuaciones` (ver crear_torneo), así que la función no puede recomponerlo.
 * Viaja desde el cliente y es **sólo informativo** (contexto del estado final de
 * la mesa). Esa línea no es, por tanto, testigo de nada: a diferencia de los
 * puntos, nadie puede contrastarla contra la base de datos. Se asume porque las
 * muertes no afectan al ranking.
 *
 * El token del bot vive en los secretos de Edge Functions, nunca aquí: todo lo
 * que empieza por `VITE_` acaba en el bundle, y el bundle está en un repositorio
 * público.
 *
 * Lanza si no se ha podido avisar. Quien llama tiene que tratarlo como un aviso,
 * no como un fallo al guardar: cuando esto se ejecuta la partida ya está en la
 * base de datos y no hay vuelta atrás.
 */
export async function avisarPartida(
  torneoId: number,
  partidas: number[],
  muertos: MuertoAviso[] = []
): Promise<void> {
  const { error } = await getSupabase().functions.invoke("avisar-partida", {
    body: { torneo_id: torneoId, partidas, muertos },
  });

  if (error) throw new Error(await detalleErrorFuncion(error));
}

/**
 * Los muertos de las filas que se van a guardar, para `avisarPartida`.
 *
 * Sale de las MISMAS filas que el resto del aviso (`emparejarFilas`, vía
 * `FilaPuntuacionDetalle.vive`), así que lo que se anuncia muerto es lo que el
 * organizador marcó muerto en el modal. Las filas importadas ya están excluidas
 * de `filas`, igual que en el envío a la base de datos.
 */
export function muertosDeFilas(filas: FilaPuntuacionDetalle[]): MuertoAviso[] {
  return filas
    .filter((f) => !f.vive)
    .map((f) => ({ num_partida: f.num_partida, jugador: f.jugador }));
}

/**
 * Publica el enlace a una mesa en el tema de "mesas" del grupo de Telegram.
 *
 * A diferencia de avisarPartida, el **texto lo compone el cliente**: una mesa
 * planificada (quién se sienta y con qué personaje) no está en la base de datos,
 * así que la Edge Function no puede recomponerla. Por eso `avisar-mesa` recibe
 * el mensaje ya hecho y sólo comprueba que quien llama es organizador antes de
 * enviarlo. La función publica en el tema `telegramThreadMesaId`, distinto del
 * de los avisos de partida guardada.
 *
 * Lanza si no se ha podido publicar; quien llama lo trata como un aviso: el
 * enlace ya está copiado en el portapapeles, así que el envío al grupo es un
 * extra, no el camino crítico.
 */
export async function avisarMesa(texto: string): Promise<void> {
  const { error } = await getSupabase().functions.invoke("avisar-mesa", {
    body: { texto },
  });

  if (error) throw new Error(await detalleErrorFuncion(error));
}

/**
 * Saca el motivo de verdad de un error de functions.invoke.
 *
 * functions.invoke no lee el cuerpo de una respuesta de error: deja la Response
 * en `context` y devuelve un mensaje genérico ("Edge Function returned a non-2xx
 * status code"), que no dice nada. El motivo real (falta un secreto, el chat_id
 * no es el del grupo, el bot fue expulsado, el tema no existe) va en el JSON.
 */
async function detalleErrorFuncion(error: {
  message: string;
  context?: unknown;
}): Promise<string> {
  let detalle = error.message;
  const contexto = error.context;
  if (contexto instanceof Response) {
    try {
      const cuerpo = (await contexto.json()) as { error?: string };
      if (cuerpo?.error) detalle = cuerpo.error;
    } catch {
      // Respuesta sin JSON (un 502 del gateway, por ejemplo): se queda el
      // mensaje genérico, que al menos dice que la llamada no llegó.
    }
  }
  return detalle;
}

/**
 * Da de alta la sesión de juego. Una llamada, una transacción.
 *
 * Todo lo que el script de SSMS hacía entre BEGIN y COMMIT pasa dentro de la
 * función de PostgreSQL: si cualquier paso falla, no queda nada a medias.
 */
export async function crearTorneo(
  payload: CrearTorneoPayload,
  crearJugadores = false
): Promise<CrearTorneoResultado> {
  const { data, error } = await getSupabase().rpc("crear_torneo", {
    p_payload: payload as unknown as never,
    p_crear_jugadores: crearJugadores,
  });

  if (error) {
    // Los mensajes de las excepciones de crear_torneo() ya están redactados
    // para leerse tal cual; details/hint sólo aparecen en fallos inesperados.
    const extra = [error.details, error.hint].filter(Boolean).join(" ");
    throw new Error(extra ? `${error.message} ${extra}` : error.message);
  }

  return data as unknown as CrearTorneoResultado;
}
