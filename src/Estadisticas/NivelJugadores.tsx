import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../Navbar";
import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import ErrorConexion from "../ui/ErrorConexion";
import type { Database } from "../supabase/database.types";

type FilaRpc =
  Database["public"]["Functions"]["fn_nivel_jugadores"]["Returns"][number];

/**
 * El generador de tipos de Supabase no sabe de nulos en el retorno de una
 * función y los marca todos como obligatorios, pero no lo son: un jugador en el
 * último nivel no tiene `exp_necesaria`, y sin ella tampoco hay `porcentaje`.
 * Se corrige aquí para que el formateo defensivo de abajo siga compilando
 * después de cada regeneración de los tipos.
 */
type Fila = { [K in keyof FilaRpc]: FilaRpc[K] | null };

/**
 * Nivel y progreso de cada jugador.
 *
 * Sustituye a la pestaña "Niveles" de Tableau. Toda la aritmética vive en
 * public.fn_nivel_jugadores (ver BD/migration/pg/09_v_nivel_jugadores.sql), que
 * es el puerto de la consulta que se lanzaba a mano contra Azure. Aquí no se
 * recalcula nada: sólo se formatea.
 *
 * Los dos filtros del informe (nivel máximo y meses de actividad) eran
 * constantes en el original y ahora son los dos selectores de arriba. Van como
 * parámetros de la función y no como filtros de PostgREST porque la resta de
 * meses tiene que hacerse en la base de datos: allí está decidido que la
 * "fecha de hoy" es la de Europe/Madrid y no la de UTC, y calcularla en el
 * navegador la dejaría a merced del reloj de quien mire la web.
 *
 * El filtro de nivel es "igual o inferior" y actúa sobre el nivel que se ve en
 * la tabla, no sobre el desbloqueado por experiencia. En Azure era al revés y
 * despistaba: se elegía 8 y salían jugadores con un 7 en la columna Nivel.
 *
 * El orden se pide explícitamente en lugar de confiar en el ORDER BY de la
 * función, porque PostgREST no lo garantiza.
 */

/** Valores por defecto: los del informe original. */
const MESES_POR_DEFECTO = 3;
const NIVEL_POR_DEFECTO = 11;

/**
 * Rango del desplegable de nivel, el mismo que el de la página de Ranking.
 * Aquí el número no es el nivel de una partida sino el techo del filtro, y el
 * techo entra: se muestran los jugadores de ese nivel o inferior.
 */
const NIVEL_MINIMO = 1;
const NIVEL_MAXIMO = 15;

/** El nivel es numeric: 9.0 debe verse "9", pero existe el nivel 6.5. */
const formatearNivel = (nivel: number | null): string =>
  nivel === null ? "—" : String(Number(nivel));

/**
 * Porcentaje a mostrar.
 *
 * `completo` es lo único que decide el verde, así que el número no puede
 * redondear hacia arriba hasta 100 sin serlo: un 99,6 % se muestra como 99 %
 * para que "100%" y el verde signifiquen siempre lo mismo.
 */
const formatearPorcentaje = (fila: Fila): string => {
  if (fila.completo) return "100%";
  if (fila.porcentaje === null) return "—";
  return `${Math.min(99, Math.round(fila.porcentaje))}%`;
};

const NivelJugadores = () => {
  const [meses, setMeses] = useState<number>(MESES_POR_DEFECTO);
  const [nivelMaximo, setNivelMaximo] = useState<number>(NIVEL_POR_DEFECTO);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * El fallo es de configuración del despliegue, no de la base de datos.
   * Reintentar no lo arregla, así que no se ofrece el botón.
   */
  const [sinConfigurar, setSinConfigurar] = useState<boolean>(false);
  /**
   * Contador que sólo existe para relanzar el efecto sin cambiar los filtros.
   * Es lo que hace el botón de reintentar: repetir la misma consulta.
   */
  const [recarga, setRecarga] = useState<number>(0);

  const cargar = useCallback(
    async (nivel: number, mesesAtras: number): Promise<Fila[] | null> => {
      const { data, error: err } = await getSupabase().rpc(
        "fn_nivel_jugadores",
        { p_nivel_maximo: nivel, p_meses: mesesAtras }
      );

      if (err) {
        console.error("Error leyendo los niveles:", err);
        setError(err.message);
        return null;
      }
      return (data ?? []) as Fila[];
    },
    []
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSinConfigurar(true);
      setError(
        "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en este " +
          "despliegue."
      );
      setCargando(false);
      return;
    }

    // Cambiar cualquiera de los dos selectores relanza el efecto, y esta bandera
    // descarta la respuesta de la consulta anterior: sin ella, la más lenta
    // podría llegar la última y pintar lo que ya no se ha pedido.
    let cancelado = false;

    setCargando(true);
    setError(null);

    cargar(nivelMaximo, meses).then((resultado) => {
      if (cancelado) return;
      setFilas(resultado ?? []);
      setCargando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [cargar, nivelMaximo, meses, recarga]);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-3xl mx-auto px-4 py-10 sm:px-6">
          <div className="mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              Nivel jugadores
            </h1>
            <p className="text-slate-600">
              Nivel actual y progreso hacia el siguiente.
            </p>
          </div>

          {/* Filtros del informe */}
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="mesesActividad"
                className="text-sm font-semibold text-slate-700"
              >
                Han jugado en los últimos
              </label>
              <input
                id="mesesActividad"
                name="mesesActividad"
                type="number"
                min={1}
                max={120}
                value={meses}
                onChange={(e) =>
                  setMeses(
                    Math.max(
                      1,
                      Math.min(
                        120,
                        parseInt(e.target.value, 10) || MESES_POR_DEFECTO
                      )
                    )
                  )
                }
                className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                title="Número de meses hacia atrás para filtrar jugadores"
              />
              <span className="text-sm text-slate-600">meses</span>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="nivelMaximo"
                className="text-sm font-semibold text-slate-700"
              >
                Nivel
              </label>
              <select
                id="nivelMaximo"
                value={nivelMaximo}
                onChange={(e) => setNivelMaximo(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                title="Sólo jugadores cuyo nivel es éste o inferior"
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
              <span className="text-sm text-slate-600">o inferior</span>
            </div>

            {!cargando && !error && (
              <span className="text-sm text-slate-500">
                {filas.length} {filas.length === 1 ? "jugador" : "jugadores"}
              </span>
            )}
          </div>

          {error && (
            <ErrorConexion
              que="los niveles de los jugadores"
              detalle={error}
              onReintentar={
                sinConfigurar ? undefined : () => setRecarga((n) => n + 1)
              }
              reintentando={cargando}
            />
          )}

          {cargando ? (
            <p className="py-12 text-center text-slate-500">Cargando…</p>
          ) : filas.length === 0 && !error ? (
            <p className="py-12 text-center text-slate-500">
              Ningún jugador de nivel {nivelMaximo} o inferior ha jugado en ese
              plazo.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-lg">
              <table className="min-w-full border-collapse text-sm">
                <caption className="sr-only">
                  Nivel y progreso de los jugadores activos
                </caption>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                    >
                      Jugador
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide"
                    >
                      Nivel
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide"
                    >
                      Progreso
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => {
                    const ancho = Math.min(100, Math.max(0, fila.porcentaje ?? 0));
                    const texto = formatearPorcentaje(fila);

                    return (
                      <tr
                        key={fila.jugador}
                        className="border-t border-slate-200"
                      >
                        <th
                          scope="row"
                          className="whitespace-nowrap px-4 py-2 text-left text-base font-semibold text-slate-800"
                        >
                          {fila.jugador}
                        </th>
                        <td className="px-4 py-2 text-right text-base tabular-nums text-slate-700">
                          {formatearNivel(fila.nivel)}
                        </td>
                        <td className="px-2 py-2">
                          {/*
                            La barra es decorativa (aria-hidden) y el porcentaje
                            va como texto, así que un lector de pantalla lee el
                            valor y no depende del color. El verde del 100 % se
                            acompaña del propio "100%" por la misma razón: el
                            color no es el único portador de la información.
                          */}
                          <div
                            className={`relative h-7 w-full overflow-hidden rounded ${
                              fila.completo ? "bg-lime-500" : "bg-slate-100"
                            }`}
                            title={
                              fila.exp !== null && fila.exp_necesaria !== null
                                ? `${Number(fila.exp)} / ${fila.exp_necesaria} exp`
                                : undefined
                            }
                          >
                            {!fila.completo && (
                              <div
                                aria-hidden="true"
                                className="absolute inset-y-0 left-0 bg-blue-400"
                                style={{ width: `${ancho}%` }}
                              />
                            )}
                            <span
                              className={`relative z-10 flex h-full items-center justify-center text-sm font-semibold ${
                                fila.completo
                                  ? "text-lime-950"
                                  : "text-slate-900"
                              }`}
                            >
                              {texto}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 space-y-1 text-xs text-slate-500">
            <p>
              El nivel que se muestra es el menor entre el desbloqueado por
              experiencia y el máximo que el jugador ha jugado en mesa, y es ése
              el que filtra el selector de arriba.
            </p>
            <p>
              Cuando alguien desbloquea un nivel que todavía no ha jugado, la
              barra aparece llena y en verde: ya tiene la experiencia y sólo le
              falta jugar ese nivel.
            </p>
          </div>

          <p className="mt-8">
            <Link
              to="/estadisticas"
              className="text-blue-600 hover:font-semibold"
            >
              ← Clasificación de la temporada
            </Link>
          </p>
        </div>
      </div>
    </>
  );
};

export default NivelJugadores;
