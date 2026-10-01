import React from "react";
import { barClasses } from "@mui/x-charts/BarChart";
import { pieArcLabelClasses } from "@mui/x-charts/PieChart";

/**
 * Piezas comunes de las páginas con gráficos (Qué bando gana y El espía).
 *
 * Importa de @mui/x-charts, así que sólo deben usarlo páginas cargadas con
 * React.lazy: si lo importara una página del bundle principal, la biblioteca de
 * gráficos acabaría viajando en él.
 */

export const numero = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 1,
});

export const fmtPct = (v: number | null): string =>
  v === null ? "" : `${numero.format(v)} %`;

/** Etiqueta dentro de un tramo de barra apilada, sólo si cabe. */
export const etiquetaTramo = (item: { value: number | null }): string | null =>
  item.value !== null && item.value >= 9 ? `${Math.round(item.value)} %` : null;

/**
 * Etiquetas en blanco dentro de las barras y de los sectores. Por defecto son
 * negras, y sobre el rojo, el verde y el azul de los bandos apenas se leen.
 */
export const sxEtiquetasBarra = {
  [`& .${barClasses.label}`]: { fill: "#FFFFFF", fontWeight: 600 },
};
export const sxEtiquetasSector = {
  [`& .${pieArcLabelClasses.root}`]: { fill: "#FFFFFF", fontWeight: 600 },
};

/**
 * Eje de porcentajes de 0 a 100. Los tramos apilados suman 100 salvo por el
 * redondeo a un decimal, y sin `max` el eje saltaría a 120.
 */
export const ejePorcentaje = {
  min: 0,
  max: 100,
  valueFormatter: (v: number) => `${v} %`,
};

export const Bloque = ({
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

/** Nota bajo un gráfico de quién gana, cuando hay partidas que no cuentan. */
export const NotaSinGanador = ({ n }: { n: number }) =>
  n === 0 ? null : (
    <p className="mt-2 text-xs text-slate-500">
      {n === 1
        ? "1 partida no cuenta en los porcentajes"
        : `${n} partidas no cuentan en los porcentajes`}{" "}
      porque no tiene{n === 1 ? "" : "n"} un ganador claro: nadie marcado como
      ganador, o dos bandos a la vez.
    </p>
  );

/**
 * La tabla con los datos del gráfico, plegada. Es la alternativa accesible: un
 * lector de pantalla no puede leer un SVG de barras, y así el dato está también
 * como texto.
 */
export const TablaDatos = ({
  titulo,
  cabeceras,
  filas,
}: {
  titulo: string;
  cabeceras: string[];
  filas: (string | number)[][];
}) => (
  <details className="mt-3 text-sm">
    <summary className="cursor-pointer text-blue-600 hover:font-semibold">
      Ver los datos en una tabla
    </summary>
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-left">
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr className="bg-slate-800 text-white">
            {cabeceras.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={`px-3 py-2 text-xs font-semibold uppercase ${
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={String(fila[0])} className="border-t border-slate-200">
              {fila.map((celda, i) =>
                i === 0 ? (
                  <th
                    key={i}
                    scope="row"
                    className="whitespace-nowrap px-3 py-1 font-semibold text-slate-800"
                  >
                    {celda}
                  </th>
                ) : (
                  <td
                    key={i}
                    className="px-3 py-1 text-right tabular-nums text-slate-700"
                  >
                    {celda}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </details>
);

export const SinDatos = ({ children }: { children: React.ReactNode }) => (
  <p className="py-8 text-center text-slate-500">{children}</p>
);
