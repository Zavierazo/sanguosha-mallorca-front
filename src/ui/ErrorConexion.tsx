import React from "react";

/**
 * El aviso de "no se ha podido hablar con la base de datos", con reintento.
 *
 * Está compartido porque las cuatro pantallas que leen de Supabase tienen que
 * contar lo mismo, y antes cada una lo decía a su manera (o no lo decía). Al ser
 * uno solo, el texto y la forma de reintentar se corrigen en un sitio.
 *
 * Reintentar es volver a lanzar la consulta, no recargar la página. La página
 * también valdría en las pantallas de informes, pero no en el generador de
 * puntuaciones: allí hay estado que no se guarda en el navegador (el orden de
 * introducción de los jugadores, y con él "Restore Original Order", y el nivel
 * elegido a mano) y recargar lo tiraría. Además volvería a bajar el bundle justo
 * cuando la red es lo que está fallando.
 */
export interface ErrorConexionProps {
  /**
   * Qué no se ha podido cargar, para completar la frase: "para cargar {que}".
   * En minúsculas y con artículo: "las estadísticas", "los niveles".
   */
  que: string;
  /** El mensaje técnico. Va en letra pequeña: no es para el usuario, es la pista. */
  detalle: string | null;
  /**
   * Qué hacer al pulsar Reintentar. Sin esto no sale el botón, que es lo
   * correcto cuando el fallo no se va a arreglar repitiendo: si al despliegue le
   * faltan las variables de entorno, reintentar mil veces da lo mismo.
   */
  onReintentar?: () => void;
  /** Deshabilita el botón mientras hay una lectura en curso. */
  reintentando?: boolean;
  /** Qué se puede seguir haciendo sin base de datos, si es que se puede algo. */
  children?: React.ReactNode;
}

const ErrorConexion = ({
  que,
  detalle,
  onReintentar,
  reintentando = false,
  children,
}: ErrorConexionProps) => (
  <div
    role="alert"
    className="mb-6 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-left text-sm text-red-800"
  >
    <p className="font-semibold">
      No se ha podido conectar con la base de datos para cargar {que}.
    </p>
    {children && <div className="mt-2">{children}</div>}
    {detalle && (
      <p className="mt-2 text-xs opacity-75">
        {/* Se etiqueta el detalle para que no parezca parte del mensaje. */}
        Detalle: {detalle}
      </p>
    )}
    {onReintentar && (
      <button
        type="button"
        onClick={onReintentar}
        disabled={reintentando}
        className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {reintentando ? "Reintentando…" : "🔄 Reintentar"}
      </button>
    )}
  </div>
);

export default ErrorConexion;
