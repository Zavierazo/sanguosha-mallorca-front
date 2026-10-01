import React, { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../Navbar";
import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import ErrorConexion from "../ui/ErrorConexion";
import type { Database } from "../supabase/database.types";

type Fila = Database["public"]["Functions"]["fn_torneos"]["Returns"][number];
type TorneoCompleto = Pick<
  Database["public"]["Views"]["v_torneos_completos"]["Row"],
  "torneo_id" | "fecha"
>;

/** Valor del selector cuando no se filtra por temporada. */
const TODAS = "todas" as const;
type Temporada = number | typeof TODAS;

// ---------------------------------------------------------------------------

const columnas = [
  { clave: "pos", texto: "Pos", ayuda: "Puesto en la clasificación: ponderado, torneos ganados y, para deshacer el empate, podios. Sólo se comparte puesto cuando coinciden en las tres", centrada: true },
  { clave: "jugador", texto: "Jugador" },
  { clave: "ganados", texto: "🏆 Ganados", ayuda: "Torneos completos ganados", centrada: true },
  { clave: "podio", texto: "🏅 Podio", ayuda: "Veces entre los tres primeros por puntos del torneo", centrada: true },
  { clave: "participados", texto: "Participados", ayuda: "Torneos completos en los que ha jugado", centrada: true },
  { clave: "pct_wins", texto: "★ % Wins", ayuda: "Torneos ganados sobre torneos jugados", centrada: true },
];

// `fn_torneos` devuelve además `ponderado` y `elo`. No se pintan, pero son las
// dos claves que ordenan la tabla y de las que sale `pos`, así que se quedan en
// la función: son la explicación de por qué las filas van en ese orden y no en el
// de la columna de torneos ganados.

const Torneos = () => {
  const [temporada, setTemporada] = useState<Temporada>(TODAS);
  const [torneos, setTorneos] = useState<TorneoCompleto[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * El fallo es de configuración del despliegue, no de la base de datos.
   * Reintentar no lo arregla, así que no se ofrece el botón.
   */
  const [sinConfigurar, setSinConfigurar] = useState<boolean>(false);

  // Lista de torneos completos: da a la vez las temporadas del selector y el
  // recuento que sirve de denominador del ponderado.
  //
  // Se traen las 50 filas y se agrupan aquí en lugar de pedir una vista
  // agregada: son pocas y crecen despacio (50 en once años), así que el corte
  // de PostgREST en 1000 filas queda muy lejos.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelado = false;

    const cargarTorneos = async () => {
      const { data, error: err } = await getSupabase()
        .from("v_torneos_completos")
        .select("torneo_id, fecha")
        .order("fecha", { ascending: false });

      if (cancelado) return;
      if (err) {
        console.error("Error leyendo los torneos completos:", err);
        return;
      }
      setTorneos(data ?? []);
    };

    cargarTorneos();
    return () => {
      cancelado = true;
    };
  }, []);

  const cargarClasificacion = useCallback(async (t: Temporada) => {
    if (!isSupabaseConfigured) {
      setCargando(false);
      setSinConfigurar(true);
      setError(
        "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en este " +
          "despliegue."
      );
      setFilas([]);
      return;
    }

    setCargando(true);
    setError(null);

    // Sin argumentos, fn_torneos recorre toda la historia. Es como se lanzaba la
    // consulta original, que llevaba el filtro de fechas comentado.
    const { data, error: err } = await getSupabase().rpc(
      "fn_torneos",
      t === TODAS ? {} : { p_desde: `${t}-01-01`, p_hasta: `${t}-12-31` }
    );

    if (err) {
      console.error("Error leyendo la clasificación de torneos:", err);
      setError(err.message);
      setFilas([]);
    } else {
      setFilas(data ?? []);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarClasificacion(temporada);
  }, [temporada, cargarClasificacion]);

  const temporadas = useMemo(() => {
    const anyos = new Set<number>();
    for (const t of torneos) {
      if (t.fecha) anyos.add(Number(t.fecha.slice(0, 4)));
    }
    // Array.from y no [...anyos]: el target de TypeScript del proyecto no
    // permite recorrer un Set con el operador de propagación.
    return Array.from(anyos).sort((a, b) => b - a);
  }, [torneos]);

  const torneosEnRango = useMemo(() => {
    if (temporada === TODAS) return torneos.length;
    return torneos.filter((t) => t.fecha?.startsWith(`${temporada}`)).length;
  }, [torneos, temporada]);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-3xl mx-auto px-4 py-10 sm:px-6">
          <div className="mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              Torneos
            </h1>
            <p className="text-slate-600">
              Quién gana torneos, no partidas. Sólo cuentan los torneos que
              completaron la liguilla: tantas partidas jugadas como jugadores en
              la mesa, de forma que todos han sido Rey una vez.
            </p>
          </div>

          {/* Selector de temporada */}
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <label
              htmlFor="temporada"
              className="text-sm font-semibold text-slate-700"
            >
              Temporada
            </label>
            <select
              id="temporada"
              value={temporada}
              onChange={(e) =>
                setTemporada(
                  e.target.value === TODAS ? TODAS : Number(e.target.value)
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value={TODAS}>Todas</option>
              {temporadas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            {torneos.length > 0 && (
              <span className="text-sm text-slate-500">
                {torneosEnRango} torneos completos · {filas.length} ganadores
              </span>
            )}
          </div>

          {/*
            Como en Estadísticas, aquí no hay nada que enseñar sin la base de
            datos: sólo ella sabe qué torneos completaron la liguilla.
          */}
          {error && (
            <ErrorConexion
              que="la clasificación de torneos"
              detalle={error}
              onReintentar={
                sinConfigurar ? undefined : () => cargarClasificacion(temporada)
              }
              reintentando={cargando}
            />
          )}

          {cargando ? (
            <p className="py-12 text-center text-slate-500">Cargando…</p>
          ) : filas.length === 0 && !error ? (
            <p className="py-12 text-center text-slate-500">
              {temporada === TODAS
                ? "No hay ningún torneo completo registrado."
                : `Ningún torneo completo en ${temporada}.`}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl bg-white shadow-lg">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Clasificación por torneos ganados
                  {temporada === TODAS ? " (toda la historia)" : ` en ${temporada}`}
                </caption>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {columnas.map((c) => (
                      <th
                        key={c.clave}
                        scope="col"
                        title={c.ayuda}
                        className={`whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide ${
                          c.centrada ? "text-center" : "text-left"
                        }`}
                      >
                        {c.texto}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr
                      key={f.jugador}
                      className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}
                    >
                      <td className="px-3 py-1 text-center font-mono text-slate-500 tabular-nums">
                        {f.pos}
                      </td>
                      <th
                        scope="row"
                        className="whitespace-nowrap px-3 py-1 text-left font-semibold text-slate-800"
                      >
                        {f.jugador}
                      </th>
                      <td className="px-3 py-1 text-center font-semibold tabular-nums">
                        {f.ganados}
                      </td>
                      <td className="px-3 py-1 text-center tabular-nums">
                        {f.podio}
                      </td>
                      <td className="px-3 py-1 text-center tabular-nums">
                        {f.participados}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1 text-center tabular-nums">
                        <span aria-hidden="true" className="text-amber-400">
                          ★
                        </span>{" "}
                        <span className="font-semibold">{f.pct_wins} %</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 space-y-1 text-xs text-slate-500">
            <p>
              Sólo aparece quien haya ganado al menos un torneo completo. El
              ganador de un torneo es quien más puntos suma; si hay empate,
              decide la mejor partida, luego las partidas ganadas.
            </p>
            <p>
              Aquí cuentan todas las partidas del torneo, también las de cuatro
              jugadores y las no puntuables. Es lo contrario que en Estadísticas,
              y por eso las dos secciones no tienen que cuadrar.
            </p>
            <p>
              El podio se reparte por puntos, sin desempate: si dos jugadores
              empatan comparten puesto, así que un torneo puede dar más de tres
              podios.
            </p>
            <p>
              El orden no es el de la columna de torneos ganados: manda el
              ponderado, que es torneos ganados × torneos jugados ÷ total de
              torneos completos. Premia ganar habiendo jugado mucho, así que dos
              victorias en veinticuatro torneos valen más que cuatro en diez. A
              igualdad de ponderado y de torneos ganados, sube quien tenga más
              podios; dos jugadores sólo comparten puesto si coinciden en los
              tres.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Torneos;
