import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * El bloque de "Raw data": el texto de la partida, con copiar y compartir.
 *
 * Antes lo pintaba `CopyBlock` de react-code-blocks con resaltado de SQL. El
 * texto ya no es SQL, y un resaltador aplicando reglas de otro lenguaje colorea
 * palabras al azar, así que se pinta como lo que es: texto monoespaciado. De
 * paso, los tres botones quedan en una fila con el estilo del resto de la
 * página, en lugar del icono de copiar que traía el componente.
 */
export interface RawDataProps {
  /** El texto ya formateado. Ver ./formatoRawData.ts. */
  texto: string;
  /** Si no hay ninguna ronda apuntada todavía: no hay nada que compartir. */
  vacio: boolean;
}

/**
 * Cuánto texto codificado se le pasa a Telegram por la URL antes de no fiarse.
 *
 * El enlace de compartir de Telegram mete el mensaje en la query, y ni el
 * navegador ni Telegram garantizan una longitud. Una mesa de 10 jugadores con 10
 * rondas son 100 filas, y ahí el enlace se va por encima de los 8 kB. Pasado el
 * tope se avisa de que puede llegar cortado, y como el texto se copia igualmente
 * al portapapeles, siempre queda la salida de pegarlo a mano.
 */
const TOPE_URL_TELEGRAM = 4000;

const RawData = ({ texto, vacio }: RawDataProps) => {
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const temporizador = useRef<number | null>(null);

  // El mensaje de "copiado" se borra solo. El temporizador se cancela al
  // desmontar: si no, escribe estado en un componente que ya no está.
  const avisar = useCallback((mensaje: string) => {
    setAviso(mensaje);
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setAviso(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (temporizador.current !== null)
        window.clearTimeout(temporizador.current);
    },
    []
  );

  /**
   * Copia al portapapeles.
   *
   * `navigator.clipboard` no existe fuera de un contexto seguro (http:// que no
   * sea localhost). En ese caso no se finge que ha funcionado: se dice que hay
   * que seleccionar el texto a mano.
   */
  const copiar = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!navigator.clipboard?.writeText) {
      setError(
        "Este navegador no deja copiar automáticamente. Selecciona el texto de abajo y cópialo a mano."
      );
      return false;
    }
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      setError(
        "No se ha podido copiar. Selecciona el texto de abajo y cópialo a mano."
      );
      return false;
    }
  }, [texto]);

  const handleCopiar = useCallback(async () => {
    if (await copiar()) avisar("Copiado al portapapeles.");
  }, [avisar, copiar]);

  /**
   * Compartir del sistema: la hoja nativa del móvil, con Telegram dentro.
   *
   * Es el camino bueno donde existe (Android, iOS, algunos escritorios): no pasa
   * por una URL, así que no hay tope de longitud, y deja elegir el grupo.
   */
  const handleCompartir = useCallback(async () => {
    setError(null);
    try {
      await navigator.share({
        title: "Puntuaciones Sanguosha",
        text: texto,
      });
    } catch (e: unknown) {
      // Cancelar el diálogo lanza AbortError. No es un fallo: no se dice nada.
      if (e instanceof Error && e.name === "AbortError") return;
      setError(
        "El sistema no ha podido compartir. Copia el texto y pégalo en Telegram."
      );
    }
  }, [texto]);

  /**
   * Abre Telegram con el mensaje ya escrito, y lo copia por si llega cortado.
   *
   * Se copia SIEMPRE antes de abrir: el enlace de compartir de Telegram lleva el
   * mensaje en la query y una mesa larga puede pasarse de largo. Con el texto en
   * el portapapeles, quien comparte puede pegarlo sin volver a la web.
   */
  const handleTelegram = useCallback(async () => {
    const copiado = await copiar();

    // La URL de la página va como enlace del mensaje: le dice a quien lo recibe
    // dónde pegarlo. El parseador ignora esa línea al importar.
    const enlace = `https://t.me/share/url?url=${encodeURIComponent(
      window.location.href
    )}&text=${encodeURIComponent(texto)}`;

    if (enlace.length > TOPE_URL_TELEGRAM) {
      avisar(
        copiado
          ? "El mensaje es largo y Telegram puede recortarlo: está copiado al portapapeles, pégalo si ves que falta algo."
          : "El mensaje es largo y Telegram puede recortarlo. Revísalo antes de enviarlo."
      );
    } else if (copiado) {
      avisar("Copiado también al portapapeles.");
    }

    window.open(enlace, "_blank", "noopener,noreferrer");
  }, [avisar, copiar, texto]);

  return (
    <div className="mt-5 text-start">
      <h3 className="text-lg font-medium">Raw data</h3>
      <p className="mt-1 text-sm text-gray-600">
        El resumen de la partida en texto. Si no puedes guardar en la base de
        datos, cópialo o compártelo por Telegram: cualquier organizador puede
        pegarlo en <strong>Importar Raw Data</strong>, arriba en esta misma
        página, y guardarlo desde ahí.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
          onClick={handleCopiar}
          disabled={vacio}
        >
          📋 Copiar
        </button>

        {/*
          Sólo se ofrece si el navegador lo tiene. Un botón que siempre falla en
          escritorio es peor que no tenerlo, y el de Telegram cubre ese caso.
        */}
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button
            type="button"
            className="px-3 py-1 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:ring-4 focus:outline-none focus:ring-indigo-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
            onClick={handleCompartir}
            disabled={vacio}
          >
            📤 Compartir
          </button>
        )}

        <button
          type="button"
          className="px-3 py-1 text-sm font-medium text-white bg-sky-500 rounded-lg hover:bg-sky-600 focus:ring-4 focus:outline-none focus:ring-sky-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
          onClick={handleTelegram}
          disabled={vacio}
          title="Abre Telegram con el mensaje escrito, y lo copia al portapapeles"
        >
          ✈️ Telegram
        </button>
      </div>

      <div aria-live="polite">
        {aviso && <p className="mt-2 text-sm text-green-700">{aviso}</p>}
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {/*
        `whitespace-pre` y no `pre-wrap`: el relleno alinea las columnas y
        partir las líneas las descuadra. Con scroll horizontal se lee entero.
      */}
      <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100 whitespace-pre">
        {texto}
      </pre>
    </div>
  );
};

export default RawData;
