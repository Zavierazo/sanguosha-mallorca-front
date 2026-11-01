import React from "react";
import type { AuthState } from "../supabase/useAuth";

interface SesionOrganizadorProps {
  auth: AuthState;
}

/**
 * La sesión de organizador, en la cabecera de Ranking.
 *
 * Antes esta UI vivía dentro de GuardarPartida, al final de la página: no se
 * entraba con Google hasta llegar a "Guardar en la base de datos". Se ha subido
 * aquí para que el usuario pueda estar ya identificado cuando abre el modal de
 * ronda, donde el botón de Telegram publica directamente si es organizador.
 *
 * No tiene estado propio: `auth` lo mantiene una única instancia de useAuth()
 * en Ranking, que se comparte con GuardarPartida y el modal. Así hay una sola
 * suscripción a la sesión y una sola llamada a soy_organizador().
 *
 * Si Supabase no está configurado en el despliegue no se pinta nada: el aviso de
 * que faltan las variables lo da GuardarPartida, junto al bloque de guardar, que
 * es lo que deja de funcionar.
 */
const SesionOrganizador = ({ auth }: SesionOrganizadorProps) => {
  if (!auth.configured) return null;

  return (
    <div className="mx-auto mt-2 max-w-2xl rounded border border-gray-300 p-2 text-start">
      <div className="flex flex-wrap items-center gap-2">
        {!auth.ready && (
          <span className="text-sm text-gray-500">Comprobando sesión...</span>
        )}

        {auth.ready && !auth.session && (
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300"
            onClick={auth.signInWithGoogle}
          >
            Entrar con Google
          </button>
        )}

        {auth.ready && auth.session && (
          <>
            <span className="text-sm text-gray-700">
              Sesión: <strong>{auth.email}</strong>
            </span>
            <button
              type="button"
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:ring-4 focus:outline-none focus:ring-gray-300"
              onClick={auth.signOut}
            >
              Salir
            </button>
          </>
        )}

        {auth.session && auth.isOrganiser === null && (
          <span className="text-sm text-gray-500">Comprobando permisos...</span>
        )}
      </div>

      {auth.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {auth.error}
        </p>
      )}

      {auth.session && auth.isOrganiser === false && (
        <p role="alert" className="mt-2 text-sm text-yellow-800">
          La cuenta <strong>{auth.email}</strong> no está en la lista de
          organizadores. Puedes apuntar la partida, pero no insertarla en la
          base de datos ni publicar mesas en el grupo de Telegram.
        </p>
      )}
    </div>
  );
};

export default SesionOrganizador;
