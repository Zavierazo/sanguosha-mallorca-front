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

export interface CrearTorneoPayload {
  /** null crea un torneo nuevo; un id continúa uno existente. */
  torneo_id: number | null;
  descripcion: string;
  fecha: string;
  scoring_system: string;
  nivel: number;
  is_ranked: boolean;
  filas: FilaPuntuacion[];
}

/** Lo que devuelve crear_torneo(): el equivalente a los SELECT finales del script. */
export interface CrearTorneoResultado {
  torneo_id: number;
  torneo_creado: boolean;
  descripcion: string | null;
  fecha: string;
  nivel: number;
  is_ranked: boolean;
  scoring_system: string;
  partidas: number[];
  puntuaciones_insertadas: number;
  jugadores_creados: string[];
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

/**
 * Avisa al grupo de Telegram de que se acaba de guardar una partida.
 *
 * La llamada manda **sólo** el id del torneo y los números de partida: el texto
 * del mensaje lo compone la Edge Function leyendo la base de datos. Si el
 * navegador mandara el texto, quien inserta podría guardar una cosa y anunciar
 * otra, y el aviso dejaría de servir para lo que existe.
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
  partidas: number[]
): Promise<void> {
  const { error } = await getSupabase().functions.invoke("avisar-partida", {
    body: { torneo_id: torneoId, partidas },
  });

  if (!error) return;

  // functions.invoke no lee el cuerpo de una respuesta de error: deja la
  // Response en `context` y devuelve un mensaje genérico ("Edge Function
  // returned a non-2xx status code"), que no dice nada. El motivo de verdad
  // (falta un secreto, el chat_id no es el del grupo, el bot fue expulsado) va
  // en el JSON, así que hay que sacarlo de ahí.
  let detalle = error.message;
  const contexto = (error as { context?: unknown }).context;
  if (contexto instanceof Response) {
    try {
      const cuerpo = (await contexto.json()) as { error?: string };
      if (cuerpo?.error) detalle = cuerpo.error;
    } catch {
      // Respuesta sin JSON (un 502 del gateway, por ejemplo): se queda el
      // mensaje genérico, que al menos dice que la llamada no llegó.
    }
  }

  throw new Error(detalle);
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
