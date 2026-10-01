import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart } from "@mui/x-charts/BarChart";
import { PieChart } from "@mui/x-charts/PieChart";
import Navbar from "../../Navbar";
import { getSupabase, isSupabaseConfigured } from "../../supabase/client";
import { fetchAllPages } from "../../data/supabaseSource";
import { describeError } from "../../data";
import ErrorConexion from "../../ui/ErrorConexion";
import {
  MIN_JUGADORES,
  quienGanaPorMesa,
  quienGanaTotal,
  type FilaMesa,
} from "./agregarBandos";
import { COLOR_ESPIA, COLOR_REBELDES, COLOR_REY } from "../comun/coloresRol";
import {
  NotaSinGanador,
  SinDatos,
  TablaDatos,
  ejePorcentaje,
  etiquetaTramo,
  fmtPct,
  sxEtiquetasBarra,
  sxEtiquetasSector,
} from "../comun/graficos";

/**
 * Qué bando gana, según el número de jugadores de la mesa.
 *
 * Estadística general de la partida, no del espía; por eso tiene página propia.
 * Sustituye a los dos gráficos de la pestaña "roles" de `stats espía.xlsx`.
 * Lee `v_ganador_por_mesa` (una fila por tamaño de mesa) y deja fuera las mesas
 * de 4 (ver ./agregarBandos.ts). Toda la historia, también las partidas no
 * puntuables. Sin filtro de actividad: es un recuento de partidas, no de
 * jugadores.
 */
const Bandos = () => {
  const [mesas, setMesas] = useState<FilaMesa[]>([]);
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

    let cancelado = false;
    setCargando(true);
    setError(null);

    fetchAllPages((from, to, signal) =>
      getSupabase()
        .from("v_ganador_por_mesa")
        .select("num_jugadores,partidas,gana_rey,gana_rebeldes,gana_espia,sin_ganador")
        .order("num_jugadores", { ascending: true })
        .range(from, to)
        .abortSignal(signal)
    )
      .then((filas) => {
        if (cancelado) return;
        // Las columnas de una vista llegan tipadas como anulables aunque sean
        // count(*): se normalizan aquí para que la agregación no tenga que
        // preocuparse de nulos.
        setMesas(
          filas.map((m) => ({
            num_jugadores: m.num_jugadores ?? 0,
            partidas: m.partidas ?? 0,
            gana_rey: m.gana_rey ?? 0,
            gana_rebeldes: m.gana_rebeldes ?? 0,
            gana_espia: m.gana_espia ?? 0,
            sin_ganador: m.sin_ganador ?? 0,
          }))
        );
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        console.error("Error leyendo qué bando gana:", err);
        setError(describeError(err));
        setMesas([]);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [recarga]);

  const porMesa = useMemo(() => quienGanaPorMesa(mesas), [mesas]);
  const total = useMemo(() => quienGanaTotal(mesas), [mesas]);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="mb-8">
            <h1 className="mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
              Qué bando gana
            </h1>
            <p className="text-slate-600">
              Porcentaje de partidas que gana cada bando según cuántos jugadores
              había en la mesa. El Rey gana junto a sus leales. Toda la
              historia, contando también las partidas no puntuables; sólo mesas
              de {MIN_JUGADORES} jugadores o más.
            </p>
          </div>

          {error && (
            <ErrorConexion
              que="qué bando gana"
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
            <section
              aria-label="Qué bando gana"
              className="mb-8 rounded-xl bg-white p-4 shadow-lg sm:p-6"
            >
              {porMesa.length === 0 ? (
                <SinDatos>No hay partidas con ganador.</SinDatos>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <BarChart
                      height={340}
                      sx={sxEtiquetasBarra}
                      xAxis={[
                        {
                          scaleType: "band",
                          data: porMesa.map((m) => `${m.numJugadores}`),
                          label: "Jugadores en la mesa",
                        },
                      ]}
                      yAxis={[{ ...ejePorcentaje, width: 50 }]}
                      barLabel={etiquetaTramo}
                      series={[
                        {
                          label: "Rey",
                          stack: "total",
                          color: COLOR_REY,
                          data: porMesa.map((m) => m.rey),
                          valueFormatter: (v, { dataIndex }) =>
                            `${fmtPct(v)} (${porMesa[dataIndex].gana_rey} de ${porMesa[dataIndex].partidas})`,
                        },
                        {
                          label: "Rebeldes",
                          stack: "total",
                          color: COLOR_REBELDES,
                          data: porMesa.map((m) => m.rebeldes),
                          valueFormatter: (v, { dataIndex }) =>
                            `${fmtPct(v)} (${porMesa[dataIndex].gana_rebeldes} de ${porMesa[dataIndex].partidas})`,
                        },
                        {
                          label: "Espía",
                          stack: "total",
                          color: COLOR_ESPIA,
                          data: porMesa.map((m) => m.espia),
                          valueFormatter: (v, { dataIndex }) =>
                            `${fmtPct(v)} (${porMesa[dataIndex].gana_espia} de ${porMesa[dataIndex].partidas})`,
                        },
                      ]}
                    />
                  </div>
                  <div>
                    <p className="text-center text-sm font-semibold text-slate-700">
                      Todas las mesas ({total.partidas} partidas)
                    </p>
                    <PieChart
                      height={260}
                      sx={sxEtiquetasSector}
                      series={[
                        {
                          innerRadius: 30,
                          paddingAngle: 1,
                          arcLabel: (item) =>
                            item.value >= 5 ? `${Math.round(item.value)} %` : "",
                          valueFormatter: (item) => fmtPct(item.value),
                          data: [
                            { id: "rey", label: "Rey", value: total.rey, color: COLOR_REY },
                            { id: "rebeldes", label: "Rebeldes", value: total.rebeldes, color: COLOR_REBELDES },
                            { id: "espia", label: "Espía", value: total.espia, color: COLOR_ESPIA },
                          ],
                        },
                      ]}
                    />
                  </div>
                </div>
              )}
              <NotaSinGanador n={total.sinGanador} />
              <TablaDatos
                titulo="Qué bando gana según el número de jugadores"
                cabeceras={["Jugadores", "Partidas", "Rey", "Rebeldes", "Espía"]}
                filas={[
                  ...porMesa.map((m) => [
                    m.numJugadores,
                    m.partidas,
                    fmtPct(m.rey),
                    fmtPct(m.rebeldes),
                    fmtPct(m.espia),
                  ]),
                  [
                    "Total",
                    total.partidas,
                    fmtPct(total.rey),
                    fmtPct(total.rebeldes),
                    fmtPct(total.espia),
                  ],
                ]}
              />
            </section>
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

export default Bandos;
