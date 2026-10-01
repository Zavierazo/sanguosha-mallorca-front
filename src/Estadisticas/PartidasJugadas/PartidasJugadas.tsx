import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../Navbar";
import { getSupabase, isSupabaseConfigured } from "../../supabase/client";
import { fetchAllPages } from "../../data/supabaseSource";
import { describeError } from "../../data";
import ErrorConexion from "../../ui/ErrorConexion";
import type { Database } from "../../supabase/database.types";
import {
  debuts,
  pivotarPorAnyo,
  rangoTemporada,
  tablaIniciaciones,
  topPorAnyo,
  totalesColumna,
  type FilaAnyo,
  type FilaIniciacion,
  type FilaTop,
  type Temporada,
} from "./agregarPartidas";

/**
 * Partidas jugadas: cuatro informes que antes eran consultas manuales contra
 * Azure (stats\puntuales\ y stats\iniciaciones.sql).
 *
 *   1. Partidas por rol       fn_partidas_por_rol(desde, hasta)
 *   2. Partidas por año       v_partidas_por_anyo + v_temporadas, y el top 6
 *                             de cada año en v_top_partidas_por_anyo
 *   3. Fecha de debut         fn_iniciaciones().debut_fecha
 *   4. Iniciaciones           fn_iniciaciones() + fn_iniciaciones_detalle()
 *
 * Tres lecturas independientes, cada una con su propio aviso de error:
 *   - La fija (temporadas, por año, top, iniciaciones) va en un Promise.all y es
 *     todo o nada: medio informe pintado y medio vacío se leería como "no hay
 *     datos", no como un fallo.
 *   - La de roles depende de la temporada elegida y se relanza al cambiarla.
 *   - El desglose de iniciaciones se pide al pulsar un jugador.
 *
 * Se cuentan todas las partidas, también las no puntuables y las de cuatro
 * jugadores. Por eso estas cifras son mayores que las de la clasificación.
 */

type FilaRol = Database["public"]["Functions"]["fn_partidas_por_rol"]["Returns"][number];
type FilaDesglose =
  Database["public"]["Functions"]["fn_iniciaciones_detalle"]["Returns"][number];
type Temporadas = Database["public"]["Views"]["v_temporadas"]["Row"];

const SIN_CONFIGURAR =
  "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en este despliegue.";

/** Valor del <select> para "toda la historia". */
const HISTORIA = "historia";

const temporadaActual = new Date().getFullYear();

const fechaLarga = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
/** Las fechas llegan como AAAA-MM-DD; se leen en UTC para que no cambie el día. */
const fmtFecha = (iso: string): string => fechaLarga.format(new Date(`${iso}T00:00:00Z`));

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

const Bloque = ({
  id,
  titulo,
  descripcion,
  children,
}: {
  id: string;
  titulo: string;
  descripcion: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section
    aria-labelledby={id}
    className="mb-8 rounded-xl bg-white p-4 shadow-lg sm:p-6"
  >
    <h2 id={id} className="text-xl font-bold text-slate-800">
      {titulo}
    </h2>
    <p className="mb-4 mt-1 text-sm text-slate-600">{descripcion}</p>
    {children}
  </section>
);

const Cargando = () => (
  <p className="py-8 text-center text-slate-500">Cargando…</p>
);

const SinDatos = ({ children }: { children: React.ReactNode }) => (
  <p className="py-8 text-center text-slate-500">{children}</p>
);

const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide";
const filaAlterna = (i: number) => (i % 2 === 0 ? "bg-white" : "bg-slate-50");

/** Un recuento; los ceros en gris para que la tabla se lea por lo que sí hay. */
const Numero = ({ n }: { n: number }) => (
  <span className={n === 0 ? "text-slate-300" : undefined}>{n}</span>
);

// ---------------------------------------------------------------------------

const PartidasJugadas = () => {
  // --- Lectura fija -------------------------------------------------------
  const [temporadas, setTemporadas] = useState<Temporadas[]>([]);
  const [porAnyo, setPorAnyo] = useState<FilaAnyo[]>([]);
  const [top, setTop] = useState<FilaTop[]>([]);
  const [iniciaciones, setIniciaciones] = useState<FilaIniciacion[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState<number>(0);

  // --- Roles, según la temporada -----------------------------------------
  const [temporada, setTemporada] = useState<Temporada>(temporadaActual);
  const [roles, setRoles] = useState<FilaRol[]>([]);
  const [cargandoRoles, setCargandoRoles] = useState<boolean>(true);
  const [errorRoles, setErrorRoles] = useState<string | null>(null);
  const [recargaRoles, setRecargaRoles] = useState<number>(0);

  // --- Iniciaciones -------------------------------------------------------
  const [mostrarCeros, setMostrarCeros] = useState<boolean>(false);
  const [elegido, setElegido] = useState<string | null>(null);
  const [desglose, setDesglose] = useState<FilaDesglose[]>([]);
  const [cargandoDesglose, setCargandoDesglose] = useState<boolean>(false);
  const [errorDesglose, setErrorDesglose] = useState<string | null>(null);
  const [recargaDesglose, setRecargaDesglose] = useState<number>(0);

  // Lectura fija.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(SIN_CONFIGURAR);
      setCargando(false);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);

    const supabase = getSupabase();
    Promise.all([
      fetchAllPages((from, to, signal) =>
        supabase
          .from("v_temporadas")
          .select("temporada,partidas,jugadores")
          .order("temporada", { ascending: true })
          .range(from, to)
          .abortSignal(signal)
      ),
      // ~350 filas hoy, pero crece con cada jugador y cada año: se pagina, y el
      // `order` completo hace estable la paginación.
      fetchAllPages((from, to, signal) =>
        supabase
          .from("v_partidas_por_anyo")
          .select("anyo,jugador,partidas")
          .order("anyo", { ascending: true })
          .order("jugador", { ascending: true })
          .range(from, to)
          .abortSignal(signal)
      ),
      fetchAllPages((from, to, signal) =>
        supabase
          .from("v_top_partidas_por_anyo")
          .select("anyo,pos,jugador,partidas")
          .order("anyo", { ascending: true })
          .order("pos", { ascending: true })
          .order("jugador", { ascending: true })
          .range(from, to)
          .abortSignal(signal)
      ),
      fetchAllPages((from, to, signal) =>
        supabase
          .rpc("fn_iniciaciones")
          .order("jugador", { ascending: true })
          .range(from, to)
          .abortSignal(signal)
      ),
    ])
      .then(([filasTemporadas, filasAnyo, filasTop, filasIni]) => {
        if (cancelado) return;
        setTemporadas(filasTemporadas);
        // Las columnas de una vista llegan tipadas como anulables aunque nunca
        // lo sean (group by, count). Se resuelven aquí, una vez.
        setPorAnyo(
          filasAnyo
            .filter((f) => f.anyo !== null && f.jugador !== null)
            .map((f) => ({
              anyo: f.anyo!,
              jugador: f.jugador!,
              partidas: f.partidas ?? 0,
            }))
        );
        setTop(
          filasTop
            .filter((f) => f.anyo !== null && f.jugador !== null)
            .map((f) => ({
              anyo: f.anyo!,
              pos: f.pos ?? 0,
              jugador: f.jugador!,
              partidas: f.partidas ?? 0,
            }))
        );
        setIniciaciones(filasIni);
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        console.error("Error leyendo las partidas jugadas:", err);
        setError(describeError(err));
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [recarga]);

  // Roles.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setErrorRoles(SIN_CONFIGURAR);
      setCargandoRoles(false);
      return;
    }
    let cancelado = false;
    setCargandoRoles(true);
    setErrorRoles(null);

    const supabase = getSupabase();
    fetchAllPages((from, to, signal) =>
      supabase
        .rpc("fn_partidas_por_rol", rangoTemporada(temporada))
        .order("jugador", { ascending: true })
        .range(from, to)
        .abortSignal(signal)
    )
      .then((filas) => {
        if (!cancelado) setRoles(filas);
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        console.error("Error leyendo las partidas por rol:", err);
        setErrorRoles(describeError(err));
        setRoles([]);
      })
      .finally(() => {
        if (!cancelado) setCargandoRoles(false);
      });

    return () => {
      cancelado = true;
    };
  }, [temporada, recargaRoles]);

  // Desglose de iniciaciones.
  useEffect(() => {
    if (elegido === null || !isSupabaseConfigured) return;
    let cancelado = false;
    setCargandoDesglose(true);
    setErrorDesglose(null);

    const supabase = getSupabase();
    fetchAllPages((from, to, signal) =>
      supabase
        .rpc("fn_iniciaciones_detalle", { p_jugador: elegido })
        .order("fecha", { ascending: true })
        .order("torneo_id", { ascending: true })
        .order("debutante", { ascending: true })
        .range(from, to)
        .abortSignal(signal)
    )
      .then((filas) => {
        if (!cancelado) setDesglose(filas);
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        console.error("Error leyendo el desglose de iniciaciones:", err);
        setErrorDesglose(describeError(err));
        setDesglose([]);
      })
      .finally(() => {
        if (!cancelado) setCargandoDesglose(false);
      });

    return () => {
      cancelado = true;
    };
  }, [elegido, recargaDesglose]);

  const matriz = useMemo(() => pivotarPorAnyo(porAnyo), [porAnyo]);
  const sumaColumnas = useMemo(() => totalesColumna(matriz), [matriz]);
  const partidasDelAnyo = useMemo(
    () => new Map(temporadas.map((t) => [t.temporada, t.partidas ?? 0])),
    [temporadas]
  );
  const tops = useMemo(() => topPorAnyo(top), [top]);
  const listaDebuts = useMemo(() => debuts(iniciaciones), [iniciaciones]);
  const tablaIni = useMemo(
    () => tablaIniciaciones(iniciaciones, mostrarCeros),
    [iniciaciones, mostrarCeros]
  );
  const aCero = useMemo(
    () => iniciaciones.filter((f) => f.iniciados === 0).length,
    [iniciaciones]
  );

  const totalesRoles = useMemo(
    () =>
      roles.reduce(
        (s, f) => ({
          rey: s.rey + f.rey,
          leal: s.leal + f.leal,
          rebelde: s.rebelde + f.rebelde,
          espia: s.espia + f.espia,
          total: s.total + f.total,
        }),
        { rey: 0, leal: 0, rebelde: 0, espia: 0, total: 0 }
      ),
    [roles]
  );

  // El selector ofrece los años de v_temporadas. Hasta que llegan, el año en
  // curso, para que el <select> nunca tenga un valor sin opción.
  const anyosSelector = useMemo(() => {
    const anyos = temporadas
      .map((t) => t.temporada)
      .filter((a): a is number => a !== null)
      .sort((a, b) => b - a);
    return anyos.length > 0 ? anyos : [temporadaActual];
  }, [temporadas]);

  const nombreTemporada =
    temporada === null ? "toda la historia" : `la temporada ${temporada}`;

  const sinConfigurar = !isSupabaseConfigured;

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="mb-8">
            <h1 className="mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
              Partidas jugadas
            </h1>
            <p className="text-slate-600">
              Cuánto ha jugado cada uno, con qué rol, desde cuándo y a cuántos
              ha visto empezar. Cuentan todas las partidas, también las no
              puntuables y las de cuatro jugadores.
            </p>
          </div>

          {/* ------------------------------------------------ 1. Roles */}
          <Bloque
            id="por-rol"
            titulo="Partidas por rol"
            descripcion="Cuántas partidas ha jugado cada uno con cada rol."
          >
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <label
                htmlFor="temporadaRoles"
                className="text-sm font-semibold text-slate-700"
              >
                Temporada
              </label>
              <select
                id="temporadaRoles"
                value={temporada === null ? HISTORIA : String(temporada)}
                onChange={(e) =>
                  setTemporada(
                    e.target.value === HISTORIA ? null : Number(e.target.value)
                  )
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value={HISTORIA}>Toda la historia</option>
                {anyosSelector.map((a) => (
                  <option key={a} value={String(a)}>
                    {a}
                  </option>
                ))}
              </select>
              {!cargandoRoles && !errorRoles && (
                <span className="text-sm text-slate-500">
                  {roles.length} {roles.length === 1 ? "jugador" : "jugadores"}
                </span>
              )}
            </div>

            {errorRoles && (
              <ErrorConexion
                que="las partidas por rol"
                detalle={errorRoles}
                onReintentar={
                  sinConfigurar ? undefined : () => setRecargaRoles((n) => n + 1)
                }
                reintentando={cargandoRoles}
              />
            )}

            {cargandoRoles ? (
              <Cargando />
            ) : errorRoles ? null : roles.length === 0 ? (
              <SinDatos>No hay partidas en {nombreTemporada}.</SinDatos>
            ) : (
              <div className="max-h-[36rem] overflow-auto">
                <table className="min-w-full border-collapse text-sm">
                  <caption className="sr-only">
                    Partidas por rol en {nombreTemporada}
                  </caption>
                  <thead className="sticky top-0">
                    <tr className="bg-slate-800 text-white">
                      <th scope="col" className={`${th} text-left`}>Jugador</th>
                      <th scope="col" className={`${th} text-right`}>Rey</th>
                      <th scope="col" className={`${th} text-right`}>Leal</th>
                      <th scope="col" className={`${th} text-right`}>Rebelde</th>
                      <th scope="col" className={`${th} text-right`}>Espía</th>
                      <th scope="col" className={`${th} text-right`}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((f, i) => (
                      <tr key={f.jugador} className={filaAlterna(i)}>
                        <th
                          scope="row"
                          className="whitespace-nowrap px-3 py-1 text-left font-semibold text-slate-800"
                        >
                          {f.jugador}
                        </th>
                        <td className="px-3 py-1 text-right tabular-nums"><Numero n={f.rey} /></td>
                        <td className="px-3 py-1 text-right tabular-nums"><Numero n={f.leal} /></td>
                        <td className="px-3 py-1 text-right tabular-nums"><Numero n={f.rebelde} /></td>
                        <td className="px-3 py-1 text-right tabular-nums"><Numero n={f.espia} /></td>
                        <td className="px-3 py-1 text-right font-semibold tabular-nums">{f.total}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
                      <th scope="row" className="px-3 py-2 text-left">Total</th>
                      <td className="px-3 py-2 text-right tabular-nums">{totalesRoles.rey}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{totalesRoles.leal}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{totalesRoles.rebelde}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{totalesRoles.espia}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{totalesRoles.total}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Bloque>

          {/* La lectura fija alimenta los tres bloques de abajo: un solo aviso. */}
          {error && (
            <ErrorConexion
              que="las partidas por año y las iniciaciones"
              detalle={error}
              onReintentar={sinConfigurar ? undefined : () => setRecarga((n) => n + 1)}
              reintentando={cargando}
            />
          )}

          {cargando ? (
            <Cargando />
          ) : error ? null : (
            <>
              {/* -------------------------------------------- 2. Por año */}
              <Bloque
                id="por-anyo"
                titulo="Partidas por año"
                descripcion={
                  <>
                    Cuántas partidas jugó cada uno cada año, de quien más ha
                    jugado a quien menos. Al pie, la suma de la columna y cuántas
                    partidas distintas se jugaron ese año (en una mesa de seis,
                    una partida suma seis en la columna).
                  </>
                }
              >
                {matriz.filas.length === 0 ? (
                  <SinDatos>No hay partidas registradas.</SinDatos>
                ) : (
                  <div className="max-h-[36rem] overflow-auto">
                    <table className="min-w-full border-collapse text-sm">
                      <caption className="sr-only">
                        Partidas jugadas por cada jugador en cada año
                      </caption>
                      <thead className="sticky top-0 z-20">
                        <tr className="bg-slate-800 text-white">
                          <th
                            scope="col"
                            className={`${th} sticky left-0 z-10 bg-slate-800 text-left`}
                          >
                            Jugador
                          </th>
                          {matriz.anyos.map((a) => (
                            <th key={a} scope="col" className={`${th} text-right`}>
                              {a}
                            </th>
                          ))}
                          <th scope="col" className={`${th} text-right`}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matriz.filas.map((f, i) => (
                          <tr key={f.jugador} className={filaAlterna(i)}>
                            <th
                              scope="row"
                              className={`sticky left-0 z-10 whitespace-nowrap px-3 py-1 text-left font-semibold text-slate-800 ${filaAlterna(i)}`}
                            >
                              {f.jugador}
                            </th>
                            {f.porAnyo.map((n, j) => (
                              <td
                                key={matriz.anyos[j]}
                                className="px-3 py-1 text-right tabular-nums"
                              >
                                <Numero n={n} />
                              </td>
                            ))}
                            <td className="px-3 py-1 text-right font-semibold tabular-nums">
                              {f.total}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 z-20">
                        <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-left"
                          >
                            Suma
                          </th>
                          {sumaColumnas.map((n, j) => (
                            <td key={matriz.anyos[j]} className="px-3 py-2 text-right tabular-nums">
                              {n}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right tabular-nums">
                            {sumaColumnas.reduce((s, n) => s + n, 0)}
                          </td>
                        </tr>
                        <tr className="bg-slate-100 text-slate-600">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 whitespace-nowrap bg-slate-100 px-3 py-2 text-left"
                          >
                            Partidas del año
                          </th>
                          {matriz.anyos.map((a) => (
                            <td key={a} className="px-3 py-2 text-right tabular-nums">
                              {partidasDelAnyo.get(a) ?? 0}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right tabular-nums">
                            {matriz.anyos.reduce(
                              (s, a) => s + (partidasDelAnyo.get(a) ?? 0),
                              0
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                <h3 className="mb-2 mt-6 text-lg font-bold text-slate-800">
                  Los que más jugaron cada año
                </h3>
                <p className="mb-3 text-sm text-slate-600">
                  Los seis primeros de cada año. Si hay empate en el sexto puesto
                  salen todos los empatados.
                </p>
                {tops.length === 0 ? (
                  <SinDatos>No hay partidas registradas.</SinDatos>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {tops.map((t) => (
                      <table
                        key={t.anyo}
                        className="w-full border-collapse overflow-hidden rounded-lg text-sm shadow"
                      >
                        <caption className="bg-slate-800 px-3 py-2 text-left font-bold text-white">
                          {t.anyo}
                        </caption>
                        <thead className="sr-only">
                          <tr>
                            <th scope="col">Puesto</th>
                            <th scope="col">Jugador</th>
                            <th scope="col">Partidas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.filas.map((f, i) => (
                            <tr key={f.jugador} className={filaAlterna(i)}>
                              <td className="w-8 px-3 py-1 text-right font-mono text-slate-500 tabular-nums">
                                {f.pos}
                              </td>
                              <th
                                scope="row"
                                className="px-3 py-1 text-left font-semibold text-slate-800"
                              >
                                {f.jugador}
                              </th>
                              <td className="px-3 py-1 text-right tabular-nums">
                                {f.partidas}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ))}
                  </div>
                )}
              </Bloque>

              {/* -------------------------------------------- 3. Debut */}
              <Bloque
                id="debut"
                titulo="Fecha de debut"
                descripcion={
                  <>
                    La fecha del primer torneo de cada jugador, del más antiguo
                    al más reciente. El 20 de julio de 2015 es la fecha más
                    antigua de la base de datos, la de la carga histórica: quien
                    aparece con ella empezó ese día o antes.
                  </>
                }
              >
                {listaDebuts.length === 0 ? (
                  <SinDatos>No hay partidas registradas.</SinDatos>
                ) : (
                  <div className="max-h-[28rem] overflow-auto">
                    <table className="min-w-full border-collapse text-sm">
                      <caption className="sr-only">Fecha de debut de cada jugador</caption>
                      <thead className="sticky top-0">
                        <tr className="bg-slate-800 text-white">
                          <th scope="col" className={`${th} text-left`}>Jugador</th>
                          <th scope="col" className={`${th} text-left`}>Debut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {listaDebuts.map((f, i) => (
                          <tr key={f.jugador} className={filaAlterna(i)}>
                            <th
                              scope="row"
                              className="whitespace-nowrap px-3 py-1 text-left font-semibold text-slate-800"
                            >
                              {f.jugador}
                            </th>
                            <td className="whitespace-nowrap px-3 py-1 tabular-nums text-slate-700">
                              <time dateTime={f.fecha}>{fmtFecha(f.fecha)}</time>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Bloque>

              {/* -------------------------------------------- 4. Iniciaciones */}
              <Bloque
                id="iniciaciones"
                titulo="Iniciaciones"
                descripcion={
                  <>
                    Quién estaba en la mesa el día que alguien jugó por primera
                    vez. <strong>Iniciados</strong> son las personas a las que ha
                    visto debutar; <strong>sesiones</strong>, cuántos días fueron
                    (una sesión con tres novatos cuenta como una sesión y tres
                    iniciados). El día del propio debut no cuenta nunca, aunque
                    debutasen otros a la vez. Pulsa un nombre para ver a quién.
                  </>
                }
              >
                <div className="mb-4 flex items-center gap-2">
                  <input
                    id="mostrarCeros"
                    type="checkbox"
                    checked={mostrarCeros}
                    onChange={(e) => setMostrarCeros(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <label htmlFor="mostrarCeros" className="text-sm text-slate-700">
                    Mostrar también a quien no ha visto debutar a nadie ({aCero})
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="max-h-[32rem] overflow-auto">
                    <table className="min-w-full border-collapse text-sm">
                      <caption className="sr-only">Iniciaciones por jugador</caption>
                      <thead className="sticky top-0">
                        <tr className="bg-slate-800 text-white">
                          <th scope="col" className={`${th} text-right`}>Pos</th>
                          <th scope="col" className={`${th} text-left`}>Jugador</th>
                          <th scope="col" className={`${th} text-right`}>Iniciados</th>
                          <th scope="col" className={`${th} text-right`}>Sesiones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tablaIni.map((f, i) => {
                          const activo = elegido === f.jugador;
                          return (
                            <tr
                              key={f.jugador}
                              className={activo ? "bg-blue-100" : filaAlterna(i)}
                            >
                              <td className="px-3 py-1 text-right font-mono text-slate-500 tabular-nums">
                                {f.pos}
                              </td>
                              <th scope="row" className="px-3 py-1 text-left">
                                {f.iniciados === 0 ? (
                                  <span className="font-semibold text-slate-800">
                                    {f.jugador}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setElegido(f.jugador)}
                                    aria-pressed={activo}
                                    className="font-semibold text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-300"
                                  >
                                    {f.jugador}
                                  </button>
                                )}
                              </th>
                              <td className="px-3 py-1 text-right font-semibold tabular-nums">
                                <Numero n={f.iniciados} />
                              </td>
                              <td className="px-3 py-1 text-right tabular-nums">
                                <Numero n={f.iniciaciones} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div aria-live="polite">
                    {elegido === null ? (
                      <p className="py-8 text-center text-sm text-slate-500">
                        Elige un jugador para ver a quién ha visto debutar.
                      </p>
                    ) : (
                      <>
                        <h3 className="mb-2 font-bold text-slate-800">
                          A quién ha visto debutar {elegido}
                        </h3>
                        {errorDesglose && (
                          <ErrorConexion
                            que={`el desglose de ${elegido}`}
                            detalle={errorDesglose}
                            onReintentar={() => setRecargaDesglose((n) => n + 1)}
                            reintentando={cargandoDesglose}
                          />
                        )}
                        {cargandoDesglose ? (
                          <Cargando />
                        ) : errorDesglose ? null : desglose.length === 0 ? (
                          <SinDatos>Nadie.</SinDatos>
                        ) : (
                          <div className="max-h-[30rem] overflow-auto">
                            <table className="min-w-full border-collapse text-sm">
                              <caption className="sr-only">
                                Debuts que ha presenciado {elegido}
                              </caption>
                              <thead className="sticky top-0">
                                <tr className="bg-slate-800 text-white">
                                  <th scope="col" className={`${th} text-left`}>Fecha</th>
                                  <th scope="col" className={`${th} text-left`}>Debutante</th>
                                  <th scope="col" className={`${th} text-left`}>Torneo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {desglose.map((d, i) => (
                                  <tr
                                    key={`${d.torneo_id}-${d.debutante}`}
                                    className={filaAlterna(i)}
                                  >
                                    <td className="whitespace-nowrap px-3 py-1 tabular-nums text-slate-700">
                                      <time dateTime={d.fecha}>{fmtFecha(d.fecha)}</time>
                                    </td>
                                    <th
                                      scope="row"
                                      className="whitespace-nowrap px-3 py-1 text-left font-semibold text-slate-800"
                                    >
                                      {d.debutante}
                                    </th>
                                    <td className="px-3 py-1 text-slate-600">
                                      {d.descripcion || `#${d.torneo_id}`}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Bloque>
            </>
          )}

          <p className="mt-2">
            <Link to="/estadisticas" className="text-blue-600 hover:font-semibold">
              ← Clasificación de la temporada
            </Link>
          </p>
        </div>
      </div>
    </>
  );
};

export default PartidasJugadas;
