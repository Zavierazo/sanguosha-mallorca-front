/**
 * Elección de la fuente de datos y vuelta atrás automática.
 *
 * Se puede revertir a Google Sheets de tres formas, de la más rápida a la más
 * permanente:
 *
 *   1. Automática. Si la fuente activa falla, se reintenta con la otra y la web
 *      sigue funcionando. Es la única que actúa sin que nadie esté delante, y
 *      por eso es la que de verdad protege.
 *
 *   2. Añadiendo `?datos=sheets` a la URL. Queda recordado en el navegador para
 *      las visitas siguientes. Sirve para forzar una fuente sin desplegar nada,
 *      que es lo que hace falta a las 2 de la mañana. `?datos=auto` lo olvida.
 *
 *   3. Cambiando `VITE_DATA_SOURCE` en el .env y desplegando. Es el valor por
 *      defecto para todo el mundo.
 *
 * Por qué hacen falta la 1 y la 2: Vite incrusta las variables `VITE_` en el
 * bundle en tiempo de compilación, así que la opción 3 sola obliga a un
 * despliegue para cambiar de fuente. Eso no es un plan de contingencia.
 */

import { createSheetsSource } from "./sheetsSource";
import { createSupabaseSource } from "./supabaseSource";
import type { DataSource, DataSourceId } from "./types";

export * from "./types";

const STORAGE_KEY = "dataSource-v1";
const QUERY_PARAM = "datos";

const FACTORIES: Record<DataSourceId, () => DataSource> = {
  sheets: () => createSheetsSource(),
  supabase: () => createSupabaseSource(),
};

function other(id: DataSourceId): DataSourceId {
  return id === "supabase" ? "sheets" : "supabase";
}

function isDataSourceId(value: unknown): value is DataSourceId {
  return value === "sheets" || value === "supabase";
}

/** Lectura y escritura defensivas: en modo incógnito localStorage puede lanzar. */
function readStored(): DataSourceId | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isDataSourceId(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeStored(id: DataSourceId | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Sin persistencia la elección dura lo que dure la pestaña. Aceptable.
  }
}

/**
 * Fuente preferida, resolviendo URL -> navegador -> .env -> Supabase.
 *
 * El parámetro de URL se persiste como efecto secundario para que la elección
 * sobreviva a la navegación interna, que es lo que se espera al pegar un enlace.
 */
export function resolvePreferredSource(): DataSourceId {
  if (typeof window !== "undefined") {
    const requested = new URLSearchParams(window.location.search).get(QUERY_PARAM);
    if (requested === "auto") {
      writeStored(null);
    } else if (isDataSourceId(requested)) {
      writeStored(requested);
      return requested;
    }

    const stored = readStored();
    if (stored) return stored;
  }

  const configured = import.meta.env.VITE_DATA_SOURCE;
  return isDataSourceId(configured) ? configured : "supabase";
}

/** Qué le ha pasado a la fuente de datos, para poder contarlo en la interfaz. */
export interface DataSourceStatus {
  /** La que se pidió. */
  preferred: DataSourceId;
  /** La que respondió de verdad. Distinta de `preferred` si hubo que recurrir. */
  active: DataSourceId;
  /** El error que forzó el cambio, si lo hubo. */
  fallbackReason: string | null;
}

export interface ResilientDataSource extends DataSource {
  getStatus(): DataSourceStatus;
  /** Se avisa cuando el estado cambia, para repintar el indicador. */
  subscribe(listener: (status: DataSourceStatus) => void): () => void;
}

/**
 * Construye la fuente preferida envuelta en una vuelta atrás a la otra.
 *
 * Cada método se intenta con la fuente activa; si lanza, se intenta con la
 * alternativa y, si esa responde, se queda como activa. No se vuelve a la
 * preferida por sí solo: un ir y venir entre fuentes daría resultados
 * inconsistentes entre consultas de la misma pantalla. Para volver, recargar.
 */
export function createDataSource(
  preferred: DataSourceId = resolvePreferredSource()
): ResilientDataSource {
  const status: DataSourceStatus = {
    preferred,
    active: preferred,
    fallbackReason: null,
  };

  const listeners = new Set<(status: DataSourceStatus) => void>();
  const instances = new Map<DataSourceId, DataSource>();

  function notify(): void {
    const snapshot = { ...status };
    listeners.forEach((listener) => listener(snapshot));
  }

  /**
   * Las instancias se crean tarde y se memorizan. Tarde porque el constructor
   * de la de Supabase lanza si faltan las variables de entorno, y ese fallo
   * tiene que poder tratarse como cualquier otro y disparar la vuelta atrás.
   */
  function instance(id: DataSourceId): DataSource {
    let existing = instances.get(id);
    if (!existing) {
      existing = FACTORIES[id]();
      instances.set(id, existing);
    }
    return existing;
  }

  async function run<T>(
    operation: string,
    call: (source: DataSource) => Promise<T>
  ): Promise<T> {
    try {
      return await call(instance(status.active));
    } catch (primaryError) {
      const alternative = other(status.active);
      const reason =
        primaryError instanceof Error ? primaryError.message : String(primaryError);

      console.error(
        `[datos] "${operation}" ha fallado con ${status.active}. ` +
          `Probando con ${alternative}.`,
        primaryError
      );

      let result: T;
      try {
        result = await call(instance(alternative));
      } catch (alternativeError) {
        // Las dos fuentes caídas. Se propaga el error original, que es el de la
        // fuente que se quería usar y el que hay que ir a mirar.
        console.error(
          `[datos] ${alternative} también ha fallado. No hay de dónde leer.`,
          alternativeError
        );
        throw primaryError;
      }

      status.active = alternative;
      status.fallbackReason = reason;
      notify();
      return result;
    }
  }

  return {
    get id() {
      return status.active;
    },

    getStatus: () => ({ ...status }),

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    fetchPlayerActivity: () =>
      run("fetchPlayerActivity", (source) => source.fetchPlayerActivity()),

    fetchPlayerLevels: () =>
      run("fetchPlayerLevels", (source) => source.fetchPlayerLevels()),

    fetchTournaments: () =>
      run("fetchTournaments", (source) => source.fetchTournaments()),

    fetchTournamentRounds: (torneoId) =>
      run("fetchTournamentRounds", (source) =>
        source.fetchTournamentRounds(torneoId)
      ),
  };
}

/** Etiqueta para mostrar en la interfaz. */
export function describeSource(id: DataSourceId): string {
  return id === "supabase" ? "Supabase" : "Google Sheets";
}
