import React, { useCallback, useMemo, useState } from "react";
import {
  parseRawData,
  type RawDataPartida,
  type ResultadoParseo,
} from "./formatoRawData";

/**
 * Cargar en la página un Raw Data que alguien ha mandado por Telegram.
 *
 * Es la otra mitad del camino que abre `RawData.tsx`. Quien apunta la partida no
 * siempre es organizador; el organizador que sí puede insertar recibe el texto,
 * lo pega aquí, la pantalla queda igual que la de quien jugó, y guarda con el
 * botón de siempre.
 *
 * Va plegado y arriba, antes del selector de jugadores, porque cargar sustituye
 * la mesa y las puntuaciones que haya en pantalla. Abrir el panel es el gesto
 * que dice "quiero cargar otra cosa"; hasta entonces no estorba ni puede
 * borrarle a nadie una partida a medias.
 */
export interface ImportarRawDataProps {
  /** El `scoring_system` de esta pantalla. Un texto de otro sistema se rechaza. */
  sistemaEsperado: string;
  nivelMinimo: number;
  nivelMaximo: number;
  /** Si hay algo en pantalla que se perdería al cargar. */
  hayDatos: boolean;
  onImportar: (partida: RawDataPartida) => void;
}

const ImportarRawData = ({
  sistemaEsperado,
  nivelMinimo,
  nivelMaximo,
  hayDatos,
  onImportar,
}: ImportarRawDataProps) => {
  const [abierto, setAbierto] = useState<boolean>(false);
  const [texto, setTexto] = useState<string>("");
  const [cargado, setCargado] = useState<RawDataPartida | null>(null);

  const resultado = useMemo<ResultadoParseo | null>(
    () =>
      texto.trim().length === 0
        ? null
        : parseRawData(texto, { sistemaEsperado, nivelMinimo, nivelMaximo }),
    [nivelMaximo, nivelMinimo, sistemaEsperado, texto]
  );

  const aplicar = useCallback(
    (partida: RawDataPartida) => {
      onImportar(partida);
      setCargado(partida);
    },
    [onImportar]
  );

  /**
   * Pegar carga la partida directamente, que es el gesto que se espera.
   *
   * Se toma el portapapeles como contenido completo del campo en lugar de
   * insertarlo donde esté el cursor: pegar un segundo mensaje encima del primero
   * daría un texto con dos partidas mezcladas, y eso no es lo que quiere nadie.
   *
   * Si el texto no se entiende no se toca la página: se queda en el campo con
   * los errores debajo, para corregirlo y darle al botón.
   */
  const handlePegar = useCallback(
    (evento: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pegado = evento.clipboardData.getData("text");
      if (!pegado.trim()) return;

      evento.preventDefault();
      setTexto(pegado);
      setCargado(null);

      const leido = parseRawData(pegado, {
        sistemaEsperado,
        nivelMinimo,
        nivelMaximo,
      });
      if (leido.ok) aplicar(leido.partida);
    },
    [aplicar, nivelMaximo, nivelMinimo, sistemaEsperado]
  );

  const rondas = useMemo(() => {
    if (resultado === null || !resultado.ok) return [];
    return Array.from(
      new Set(resultado.partida.filas.map((fila) => fila.numPartida))
    ).sort((a, b) => a - b);
  }, [resultado]);

  if (!abierto) {
    return (
      <div className="mx-auto mb-4 max-w-2xl text-start">
        <button
          type="button"
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:ring-4 focus:outline-none focus:ring-gray-300"
          onClick={() => setAbierto(true)}
        >
          📥 Importar Raw Data
        </button>
        <span className="ml-2 text-sm text-gray-600">
          para cargar una partida que te hayan mandado por Telegram.
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-4 max-w-2xl rounded-lg border border-gray-300 p-3 text-start">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-medium">📥 Importar Raw Data</h3>
        <button
          type="button"
          className="px-2 py-1 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:ring-4 focus:outline-none focus:ring-gray-300"
          onClick={() => setAbierto(false)}
        >
          Cerrar
        </button>
      </div>

      <p className="mt-1 text-sm text-gray-600">
        Pega aquí el texto que te hayan mandado y la partida se carga sola:
        jugadores, rondas, nivel, fecha y descripción. Después guárdala con
        <strong> Insertar partidas en la BD</strong>, al final de la página.
      </p>

      {hayDatos && (
        <p className="mt-2 rounded border border-yellow-300 bg-yellow-100 p-2 text-sm text-yellow-900">
          ⚠️ Hay una partida en pantalla: al cargar se sustituyen los jugadores y
          las puntuaciones que haya ahora.
        </p>
      )}

      <label htmlFor="rawDataImport" className="mt-2 block text-sm font-medium">
        Raw Data
      </label>
      <textarea
        id="rawDataImport"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setCargado(null);
        }}
        onPaste={handlePegar}
        rows={8}
        spellCheck={false}
        placeholder={"Sanguosha Mallorca · Puntuaciones (formato v1)\nFecha: ..."}
        className="mt-1 w-full rounded border border-gray-300 p-2 font-mono text-xs"
      />

      <div aria-live="polite">
        {resultado !== null && !resultado.ok && (
          <div
            role="alert"
            className="mt-2 rounded border border-red-300 bg-red-100 p-2 text-sm text-red-900"
          >
            <p className="font-medium">No se puede cargar este texto:</p>
            <ul className="mt-1 list-disc pl-5">
              {resultado.errores.map((error, indice) => (
                <li key={indice}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {resultado !== null && resultado.avisos.length > 0 && (
          <div className="mt-2 rounded border border-yellow-300 bg-yellow-100 p-2 text-sm text-yellow-900">
            <p className="font-medium">Revisa esto antes de guardar:</p>
            <ul className="mt-1 list-disc pl-5">
              {resultado.avisos.map((avisoTexto, indice) => (
                <li key={indice}>{avisoTexto}</li>
              ))}
            </ul>
          </div>
        )}

        {resultado !== null && resultado.ok && (
          <>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-gray-700">
              <dt className="font-medium">Jugadores</dt>
              <dd>{resultado.partida.jugadores.join(", ")}</dd>

              <dt className="font-medium">Rondas</dt>
              <dd>
                {rondas.join(", ")} ({resultado.partida.filas.length} filas)
              </dd>

              <dt className="font-medium">Fecha</dt>
              <dd>{resultado.partida.fecha}</dd>

              <dt className="font-medium">Nivel</dt>
              <dd>{resultado.partida.nivel}</dd>

              <dt className="font-medium">Ranked</dt>
              <dd>{resultado.partida.isRanked ? "sí" : "no"}</dd>

              <dt className="font-medium">Torneo</dt>
              <dd>
                {resultado.partida.torneoId === null
                  ? "nuevo"
                  : `continuación del ${resultado.partida.torneoId}`}
              </dd>

              <dt className="font-medium">Descripción</dt>
              <dd>
                {resultado.partida.descripcion || <em>sin descripción</em>}
              </dd>
            </dl>

            {/*
              El botón queda para cuando el texto se ha escrito o corregido a
              mano, que no dispara el pegado. Se deshabilita si lo que hay en el
              campo es justo lo último cargado, para que no parezca que hace
              falta pulsarlo después de pegar.
            */}
            <button
              type="button"
              className="mt-2 px-4 py-2 text-sm font-medium text-white bg-green-700 rounded-lg hover:bg-green-800 focus:ring-4 focus:outline-none focus:ring-green-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
              onClick={() => aplicar(resultado.partida)}
              disabled={cargado !== null}
            >
              {cargado !== null ? "Cargado" : "Cargar en la página"}
            </button>

            {cargado !== null && (
              <p className="mt-2 text-sm text-green-700">
                ✅ Cargado. Comprueba la tabla y guarda con{" "}
                <strong>Insertar partidas en la BD</strong>.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ImportarRawData;
