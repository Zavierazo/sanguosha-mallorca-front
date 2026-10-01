import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart } from "@mui/x-charts/BarChart";
import Navbar from "../../Navbar";
import { getSupabase, isSupabaseConfigured } from "../../supabase/client";
import { fetchAllPages } from "../../data/supabaseSource";
import { describeError } from "../../data";
import ErrorConexion from "../../ui/ErrorConexion";
import { cuantoLeToca, equilibrio, type FilaEspia } from "./agregarEspia";
import { totalSinGanador } from "../comun/reparto";
import {
  COLOR_ESPERADO,
  COLOR_ESPIA,
  COLOR_REBELDES,
  COLOR_REY,
} from "../comun/coloresRol";
import {
  Bloque,
  NotaSinGanador,
  SinDatos,
  TablaDatos,
  ejePorcentaje,
  etiquetaTramo,
  fmtPct,
  numero,
  sxEtiquetasBarra,
} from "../comun/graficos";

/**
 * Estadísticas del espía.
 *
 * Sustituye a las consultas manuales de `stats\espía\` y a los gráficos de
 * `stats espía.xlsx`. Toda la historia, sin selector de temporada.
 *
 * Una lectura, `fn_espia(p_meses)`: una fila por jugador y tamaño de mesa, con
 * `activo` ya calculado, porque la "fecha de hoy" es la de Europe/Madrid y se
 * decide en la base de datos, igual que en Nivel jugadores. Lo demás se suma en
 * el navegador (./agregarEspia.ts).
 *
 * "Qué bando gana" vivía aquí y se movió a su propia página (../Bandos): es una
 * estadística general de la partida. "Victorias como espía" se quitó: el tramo
 * azul de "Quién gana cuando le toca espía" ya dice lo mismo.
 */

const MESES_POR_DEFECTO = 3;

/** Alto de cada fila en los gráficos por jugador, en píxeles. */
const ALTO_FILA = 28;
/** Margen para ejes y leyenda en los gráficos por jugador. */
const ALTO_EXTRA = 90;
/** Ancho reservado a los nombres en el eje Y. */
const ANCHO_NOMBRES = 120;

const altoPorJugador = (n: number, alto = ALTO_FILA) =>
  Math.max(160, n * alto + ALTO_EXTRA);

const Espia = () => {
  const [meses, setMeses] = useState<number>(MESES_POR_DEFECTO);
  const [filas, setFilas] = useState<FilaEspia[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  /** Falta configuración del despliegue: reintentar no lo arregla. */
  const [sinConfigurar, setSinConfigurar] = useState<boolean>(false);
  /** Sólo existe para relanzar el efecto desde el botón de reintentar. */
  const [recarga, setRecarga] = useState<number>(0);

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

    // Descarta la respuesta de una consulta anterior si llega la última.
    let cancelado = false;
    setCargando(true);
    setError(null);

    // Se pagina aunque hoy sean ~560 filas: jugador x tamaño de mesa crece con
    // cada jugador nuevo, y PostgREST corta en 1000 sin avisar. El `order` hace
    // estable la paginación.
    fetchAllPages((from, to, signal) =>
      getSupabase()
        .rpc("fn_espia", { p_meses: meses })
        .order("jugador", { ascending: true })
        .order("num_jugadores", { ascending: true })
        .range(from, to)
        .abortSignal(signal)
    )
      .then((filasEspia) => {
        if (!cancelado) setFilas(filasEspia);
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        console.error("Error leyendo las estadísticas del espía:", err);
        setError(describeError(err));
        setFilas([]);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [meses, recarga]);

  const toca = useMemo(() => cuantoLeToca(filas), [filas]);
  const reparto = useMemo(() => equilibrio(filas), [filas]);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="mb-8">
            <h1 className="mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
              El espía
            </h1>
            <p className="text-slate-600">
              Qué bando gana cuando a cada jugador le toca ser espía, y a quién
              le toca más a menudo. Toda la historia, contando también las
              partidas no puntuables.
            </p>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="mesesActividad"
                className="text-sm font-semibold text-slate-700"
              >
                Jugadores que han jugado en los últimos
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
            {!cargando && !error && (
              <span className="text-sm text-slate-500">
                {toca.length} {toca.length === 1 ? "jugador" : "jugadores"}
              </span>
            )}
          </div>

          {error && (
            <ErrorConexion
              que="las estadísticas del espía"
              detalle={error}
              onReintentar={
                sinConfigurar ? undefined : () => setRecarga((n) => n + 1)
              }
              reintentando={cargando}
            />
          )}

          {cargando ? (
            <p className="py-12 text-center text-slate-500">Cargando…</p>
          ) : error ? null : (
            <>
              <Bloque
                id="equilibrio-espia"
                titulo="Quién gana cuando le toca espía"
                descripcion={
                  <>
                    Para cada jugador, qué bando ganó las partidas en las que él
                    era el espía. Ordenado de más a menos victorias del Rey. Sólo
                    mesas de 5, 7, 9 y 10, que son las partidas en las que el Espía
                    tiene más peso; entre paréntesis, las partidas que cuentan.
                  </>
                }
              >
                {reparto.length === 0 ? (
                  <SinDatos>
                    Nadie de los que han jugado en ese plazo ha sido espía en
                    una mesa de 5, 7, 9 o 10.
                  </SinDatos>
                ) : (
                  <BarChart
                    layout="horizontal"
                    height={altoPorJugador(reparto.length)}
                    sx={sxEtiquetasBarra}
                    yAxis={[
                      {
                        scaleType: "band",
                        data: reparto.map((j) => `${j.jugador} (${j.partidas})`),
                        width: ANCHO_NOMBRES,
                      },
                    ]}
                    xAxis={[ejePorcentaje]}
                    barLabel={etiquetaTramo}
                    series={[
                      {
                        label: "Rey",
                        stack: "total",
                        color: COLOR_REY,
                        data: reparto.map((j) => j.rey),
                        valueFormatter: (v, { dataIndex }) =>
                          `${fmtPct(v)} (${reparto[dataIndex].gana_rey} de ${reparto[dataIndex].partidas})`,
                      },
                      {
                        label: "Rebeldes",
                        stack: "total",
                        color: COLOR_REBELDES,
                        data: reparto.map((j) => j.rebeldes),
                        valueFormatter: (v, { dataIndex }) =>
                          `${fmtPct(v)} (${reparto[dataIndex].gana_rebeldes} de ${reparto[dataIndex].partidas})`,
                      },
                      {
                        label: "Espía",
                        stack: "total",
                        color: COLOR_ESPIA,
                        data: reparto.map((j) => j.espia),
                        valueFormatter: (v, { dataIndex }) =>
                          `${fmtPct(v)} (${reparto[dataIndex].gana_espia} de ${reparto[dataIndex].partidas})`,
                      },
                    ]}
                  />
                )}
                <NotaSinGanador n={totalSinGanador(reparto)} />
                <TablaDatos
                  titulo="Quién gana cuando le toca espía"
                  cabeceras={["Jugador", "Partidas", "Rey", "Rebeldes", "Espía"]}
                  filas={reparto.map((j) => [
                    j.jugador,
                    j.partidas,
                    fmtPct(j.rey),
                    fmtPct(j.rebeldes),
                    fmtPct(j.espia),
                  ])}
                />
              </Bloque>

              <Bloque
                id="cuanto-le-toca"
                titulo="A quién le toca ser espía"
                descripcion={
                  <>
                    Porcentaje de sus partidas en las que le tocó espía, frente
                    al que le habría tocado por el tamaño de sus mesas (en una
                    de 5 toca el 20 %, en una de 9 el 11 %). Todas las mesas.
                  </>
                }
              >
                {toca.length === 0 ? (
                  <SinDatos>Nadie ha jugado en ese plazo.</SinDatos>
                ) : (
                  <BarChart
                    layout="horizontal"
                    height={altoPorJugador(toca.length, 34)}
                    yAxis={[
                      {
                        scaleType: "band",
                        data: toca.map((j) => j.jugador),
                        width: ANCHO_NOMBRES,
                      },
                    ]}
                    xAxis={[
                      {
                        min: 0,
                        valueFormatter: (v: number) => `${v} %`,
                      },
                    ]}
                    series={[
                      {
                        label: "Le tocó",
                        color: COLOR_ESPIA,
                        data: toca.map((j) => j.real),
                        valueFormatter: (v, { dataIndex }) =>
                          `${fmtPct(v)} (${toca[dataIndex].espia} de ${toca[dataIndex].partidas} partidas)`,
                      },
                      {
                        label: "Le habría tocado",
                        color: COLOR_ESPERADO,
                        data: toca.map((j) => j.esperado),
                        valueFormatter: (v, { dataIndex }) => {
                          const d = toca[dataIndex].desviacion;
                          return `${fmtPct(v)} (desviación ${d > 0 ? "+" : ""}${numero.format(d)} puntos)`;
                        },
                      },
                    ]}
                  />
                )}
                <TablaDatos
                  titulo="A quién le toca ser espía"
                  cabeceras={["Jugador", "Partidas", "Espía", "Le tocó", "Esperado", "Desviación"]}
                  filas={toca.map((j) => [
                    j.jugador,
                    j.partidas,
                    j.espia,
                    fmtPct(j.real),
                    fmtPct(j.esperado),
                    `${j.desviacion > 0 ? "+" : ""}${numero.format(j.desviacion)}`,
                  ])}
                />
              </Bloque>
            </>
          )}

          <p className="mt-2">
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

export default Espia;
