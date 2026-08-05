import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../Navbar";
import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import type { Database } from "../supabase/database.types";

/** Sólo las columnas que se piden en el select de abajo. */
type Fila = Pick<
  Database["public"]["Views"]["v_nivel_jugadores"]["Row"],
  "jugador" | "nivel" | "exp" | "exp_necesaria" | "porcentaje" | "completo"
>;

/**
 * Nivel y progreso de cada jugador.
 *
 * Sustituye a la pestaña "Niveles" de Tableau. Toda la aritmética vive en
 * public.v_nivel_jugadores (ver BD/migration/pg/09_v_nivel_jugadores.sql), que
 * es el puerto de la consulta que se lanzaba a mano contra Azure. Aquí no se
 * recalcula nada: sólo se formatea.
 *
 * La vista ya filtra (nivel < 11, con partida en los últimos 3 meses) y trae el
 * porcentaje y el indicador `completo`. El orden se pide explícitamente en lugar
 * de confiar en el ORDER BY de la vista, porque PostgREST no lo garantiza.
 */

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
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(
        "Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY " +
          "en este despliegue."
      );
      setCargando(false);
      return;
    }

    let cancelado = false;

    const cargar = async () => {
      const { data, error: err } = await getSupabase()
        .from("v_nivel_jugadores")
        .select("jugador, nivel, exp, exp_necesaria, porcentaje, completo")
        .order("nivel", { ascending: false })
        .order("exp", { ascending: false });

      if (cancelado) return;

      if (err) {
        console.error("Error leyendo los niveles:", err);
        setError(err.message);
        setFilas([]);
      } else {
        setFilas(data ?? []);
      }
      setCargando(false);
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, []);

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
              Nivel actual y progreso hacia el siguiente. Sólo jugadores por
              debajo del nivel 11 con alguna partida en los últimos tres meses.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-800"
            >
              No se han podido cargar los niveles: {error}
            </div>
          )}

          {cargando ? (
            <p className="py-12 text-center text-slate-500">Cargando…</p>
          ) : filas.length === 0 && !error ? (
            <p className="py-12 text-center text-slate-500">
              No hay jugadores activos que mostrar.
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
              experiencia y el máximo que el jugador ha jugado en mesa.
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
