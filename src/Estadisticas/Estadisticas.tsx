import React, { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../Navbar";
import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import type { Database } from "../supabase/database.types";

type Fila = Database["public"]["Functions"]["fn_estadisticas"]["Returns"][number];
type Temporada = Database["public"]["Views"]["v_temporadas"]["Row"];

// ---------------------------------------------------------------------------
// Colores
//
// Son los del formato condicional que tenia la hoja de Excel, leidos de su
// configuracion. Van como estilos en linea y no como clases de Tailwind porque
// su paleta no tiene estos tonos exactos y aproximarlos rompia la intencion:
// en Rango cada valor tiene su color, y en Division el color evoca el nombre
// (Wood madera, Bronze bronce, Silver plata, Gold oro, Iron hierro, Diamond
// azul palido, Platinum casi blanco, Hell fuego).
// ---------------------------------------------------------------------------

type Formato = { fondo: string; texto: string };

const NEUTRO: Formato = { fondo: "#F1F5F9", texto: "#94A3B8" };

// Un color por rango, no una escala: es lo que hacia el Excel.
const FORMATO_RANGO: Record<string, Formato> = {
  Recluta: { fondo: "#D9D9D9", texto: "#1F2937" },
  "Soldado raso": { fondo: "#A6A6A6", texto: "#1F2937" },
  "Oficial menor": { fondo: "#6E8B23", texto: "#FFFFFF" },
  Capitán: { fondo: "#008000", texto: "#FFFFFF" },
  Comandante: { fondo: "#4472E8", texto: "#FFFFFF" },
  General: { fondo: "#1F5FC0", texto: "#FFFFFF" },
  "Gran General": { fondo: "#FF2E5B", texto: "#FFFFFF" },
  "Comandante Supremo": { fondo: "#8B0000", texto: "#FFFFFF" },
  "Canciller Militar": { fondo: "#B34DDC", texto: "#FFFFFF" },
  "Señor de Estado": { fondo: "#FF8C00", texto: "#FFFFFF" },
  "Santo de la Guerra": { fondo: "#E3C88A", texto: "#3F2E0B" },
};

// Las divisiones salen de `medals`. Se agrupan por medalla, que es la primera
// palabra ("Gold II" -> "Gold").
//
// Challenger, Grandmaster y Master existen en la tabla pero el Excel no tenia
// regla para ellas: nadie ha llegado nunca tan arriba. No son materiales, asi
// que no hay un color que evoque el nombre; se usan los de la convencion de la
// que salen estos nombres, por encima de Diamond.
const FORMATO_DIVISION: Record<string, Formato> = {
  Challenger: { fondo: "#7C3AED", texto: "#FFFFFF" },
  Grandmaster: { fondo: "#BE123C", texto: "#FFFFFF" },
  Master: { fondo: "#9333EA", texto: "#FFFFFF" },
  Diamond: { fondo: "#DCE9FB", texto: "#1E3A5F" },
  Platinum: { fondo: "#EDEDED", texto: "#333333" },
  Gold: { fondo: "#FFD500", texto: "#4A3B00" },
  Silver: { fondo: "#C9C9C9", texto: "#333333" },
  Bronze: { fondo: "#D08430", texto: "#FFFFFF" },
  Iron: { fondo: "#5A5D4C", texto: "#FFFFFF" },
  Wood: { fondo: "#8B6244", texto: "#FFFFFF" },
  // En el Excel era un degradado de fuego. Es la division mas baja de todas.
  Hell: { fondo: "linear-gradient(90deg, #FF3B00, #FF8A00)", texto: "#FFFFFF" },
  Provisional: NEUTRO,
};

const estilo = (f: Formato): React.CSSProperties => ({
  background: f.fondo,
  color: f.texto,
});

const estiloRango = (rango: string | null): React.CSSProperties =>
  estilo((rango && FORMATO_RANGO[rango]) || NEUTRO);

const estiloDivision = (division: string | null): React.CSSProperties => {
  if (!division) return estilo(NEUTRO);
  const medalla = division.split(" ")[0];
  return estilo(FORMATO_DIVISION[medalla] ?? NEUTRO);
};

// ---------------------------------------------------------------------------
// Celdas
// ---------------------------------------------------------------------------

/**
 * Winrate de un rol, con la barra de datos que tenia la hoja de Excel.
 * La barra es decorativa: el valor va como texto para que lo lea un lector de
 * pantalla.
 */
const BarraPorcentaje = ({
  valor,
  color,
}: {
  valor: number | null;
  color: string;
}) => {
  if (valor === null) return <span className="text-slate-400">—</span>;
  if (valor === 0) return <span className="text-slate-400">0</span>;

  return (
    <div className="relative h-6 w-full min-w-[3.5rem]">
      <div
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 rounded-sm ${color}`}
        style={{ width: `${Math.min(valor, 100)}%` }}
      />
      <span className="relative z-10 flex h-full items-center justify-center text-xs font-semibold text-slate-900">
        {valor}
      </span>
    </div>
  );
};

const Emparejado = ({ nombre }: { nombre: string | null }) => {
  if (!nombre) return <span className="text-slate-400">—</span>;
  if (nombre === "N/A" || nombre === "???") {
    return <span className="text-slate-400 italic">{nombre}</span>;
  }
  return <span>{nombre}</span>;
};

// ---------------------------------------------------------------------------

const temporadaActual = new Date().getFullYear();

const Estadisticas = () => {
  const [temporada, setTemporada] = useState<number>(temporadaActual);
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Temporadas disponibles. Se leen una sola vez.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelado = false;

    const cargarTemporadas = async () => {
      const { data, error: err } = await getSupabase()
        .from("v_temporadas")
        .select("temporada, partidas, jugadores")
        .order("temporada", { ascending: false });

      if (cancelado) return;
      if (err) {
        console.error("Error leyendo las temporadas:", err);
        return;
      }
      setTemporadas(data ?? []);
    };

    cargarTemporadas();
    return () => {
      cancelado = true;
    };
  }, []);

  // Esta pantalla no tiene vuelta atras a Google Sheets, a diferencia del resto
  // de la web (ver src/data/index.ts). La hoja no lleva ni `medals` ni
  // `losing_penalty`, asi que el Elo y la division no se pueden calcular con
  // ella: la clasificacion sale de Supabase o no sale.
  const cargarEstadisticas = useCallback(async (anyo: number) => {
    if (!isSupabaseConfigured) {
      setCargando(false);
      setError(
        "Supabase no esta configurado en este despliegue: faltan " +
          "VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY."
      );
      setFilas([]);
      return;
    }

    setCargando(true);
    setError(null);

    const { data, error: err } = await getSupabase().rpc("fn_estadisticas", {
      p_desde: `${anyo}-01-01`,
      p_hasta: `${anyo}-12-31`,
    });

    if (err) {
      console.error("Error leyendo las estadisticas:", err);
      setError(err.message);
      setFilas([]);
    } else {
      setFilas(data ?? []);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarEstadisticas(temporada);
  }, [temporada, cargarEstadisticas]);

  const resumen = useMemo(
    () => temporadas.find((t) => t.temporada === temporada),
    [temporadas, temporada]
  );

  const columnas = [
    { clave: "pos", texto: "Pos", ayuda: "Puesto en la clasificación" },
    { clave: "jugador", texto: "Jugador" },
    { clave: "rango", texto: "Rango", ayuda: "Rango por experiencia acumulada (histórico, no de la temporada)" },
    { clave: "division", texto: "División", ayuda: "División según el Elo. Provisional con menos de 10 partidas" },
    { clave: "pct_wins", texto: "% Wins", ayuda: "Porcentaje de partidas ganadas en la temporada" },
    { clave: "rey", texto: "Rey", ayuda: "Porcentaje de victorias jugando de Rey" },
    { clave: "leal", texto: "Leal", ayuda: "Porcentaje de victorias jugando de Leal" },
    { clave: "rebelde", texto: "Rebelde", ayuda: "Porcentaje de victorias jugando de Rebelde" },
    { clave: "espia", texto: "Espía", ayuda: "Porcentaje de victorias jugando de Espía" },
    { clave: "sinergia", texto: "Sinergia", ayuda: "Con quien gana mas a menudo" },
    { clave: "archienemigo", texto: "Archienemigo", ayuda: "Contra quien pierde mas a menudo" },
    { clave: "antisinergia", texto: "Antisinergia", ayuda: "Con quien pierde mas a menudo" },
    { clave: "partidas", texto: "Partidas" },
  ];

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-10 sm:px-6">
          <div className="mb-8">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              Estadísticas
            </h1>
            <p className="text-slate-600">
              Clasificación de la temporada: división, winrate por rol y con
              quién se gana y se pierde.
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
              onChange={(e) => setTemporada(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {temporadas.length === 0 && (
                <option value={temporada}>{temporada}</option>
              )}
              {temporadas.map((t) => (
                <option key={t.temporada} value={t.temporada ?? undefined}>
                  {t.temporada}
                </option>
              ))}
            </select>

            {/* Este recuento sale de v_temporadas y es el bruto del año: incluye
                las partidas no puntuables y las de cuatro jugadores, que la
                clasificacion deja fuera. De ahi "registradas". */}
            {resumen && (
              <span className="text-sm text-slate-500">
                {resumen.partidas} partidas registradas · {resumen.jugadores}{" "}
                jugadores
              </span>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-800"
            >
              No se han podido cargar las estadísticas: {error}
            </div>
          )}

          {cargando ? (
            <p className="py-12 text-center text-slate-500">Cargando…</p>
          ) : filas.length === 0 && !error ? (
            <p className="py-12 text-center text-slate-500">
              No hay partidas registradas en {temporada}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl bg-white shadow-lg">
              <table className="min-w-full border-collapse text-sm">
                <caption className="sr-only">
                  Clasificación de la temporada {temporada}
                </caption>
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {columnas.map((c) => (
                      <th
                        key={c.clave}
                        scope="col"
                        title={c.ayuda}
                        className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide"
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
                      <td className="px-3 py-1 text-right font-mono text-slate-500 tabular-nums">
                        {f.pos}
                      </td>
                      <th
                        scope="row"
                        className="whitespace-nowrap px-3 py-1 text-left font-semibold text-slate-800"
                      >
                        {f.jugador}
                      </th>
                      <td className="px-1 py-1">
                        <span
                          style={estiloRango(f.rango)}
                          className="block whitespace-nowrap rounded px-2 py-1 text-center text-xs font-medium"
                        >
                          {f.rango ?? "—"}
                        </span>
                      </td>
                      <td className="px-1 py-1">
                        <span
                          style={estiloDivision(f.division)}
                          className="block whitespace-nowrap rounded px-2 py-1 text-center text-xs font-semibold"
                        >
                          {f.division ?? "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1 tabular-nums">
                        {f.pct_wins === null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <>
                            <span aria-hidden="true" className="text-amber-400">
                              ★
                            </span>{" "}
                            <span className="font-semibold">{f.pct_wins}</span>
                          </>
                        )}
                      </td>
                      <td className="px-1 py-1">
                        <BarraPorcentaje valor={f.rey} color="bg-red-400" />
                      </td>
                      <td className="px-1 py-1">
                        <BarraPorcentaje valor={f.leal} color="bg-amber-400" />
                      </td>
                      <td className="px-1 py-1">
                        <BarraPorcentaje valor={f.rebelde} color="bg-green-400" />
                      </td>
                      <td className="px-1 py-1">
                        <BarraPorcentaje valor={f.espia} color="bg-blue-400" />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1">
                        <Emparejado nombre={f.sinergia} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1">
                        <Emparejado nombre={f.archienemigo} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1">
                        <Emparejado nombre={f.antisinergia} />
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        {f.partidas ?? <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 space-y-1 text-xs text-slate-500">
            <p>
              Sólo cuentan las partidas marcadas como puntuables. Las de cuatro
              jugadores quedan fuera: no hay penalización definida para ese
              número de jugadores.
            </p>
            <p>
              Sinergias y antisinergias sólo miran a quien haya coincidido en más
              de un 20 % de las partidas del jugador.
            </p>
            <p>
              El orden es por Elo, que no se muestra: 1200 de base, más los
              puntos de la temporada, menos 50 por cada mes sin jugar. Con menos
              de 10 partidas la división queda como Provisional y el jugador va
              al final de la tabla.
            </p>
            <p>
              El rango es histórico, por experiencia acumulada, y no depende de la
              temporada elegida.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Estadisticas;
