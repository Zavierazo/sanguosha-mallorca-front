import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../supabase/useAuth";
import {
  crearTorneo,
  jugadoresDesconocidos,
  type CrearTorneoResultado,
  type FilaPuntuacion,
} from "../supabase/crearTorneo";

interface GuardarPartidaProps {
  /** Las filas ya emparejadas jugador-puntuación. */
  filas: FilaPuntuacion[];
  /** Los jugadores de la mesa, para avisar de nombres no registrados. */
  jugadores: string[];
  /** null crea un torneo nuevo; un número continúa uno existente. */
  torneoId: number | null;
  descripcion: string;
  fecha: string;
  scoringSystem: string;
  nivel: number;
  isRanked: boolean;
  /** Se llama tras un alta correcta, para fijar la continuación del torneo. */
  onGuardado: (resultado: CrearTorneoResultado) => void;
}

type Estado = "idle" | "enviando" | "ok" | "error";

const GuardarPartida = ({
  filas,
  jugadores,
  torneoId,
  descripcion,
  fecha,
  scoringSystem,
  nivel,
  isRanked,
  onGuardado,
}: GuardarPartidaProps) => {
  const auth = useAuth();

  const [estado, setEstado] = useState<Estado>("idle");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CrearTorneoResultado | null>(null);
  const [nuevos, setNuevos] = useState<string[]>([]);
  const [confirmarNuevos, setConfirmarNuevos] = useState<boolean>(false);

  const rondas = Array.from(new Set(filas.map((f) => f.num_partida))).sort(
    (a, b) => a - b
  );

  /**
   * Firma de lo que se va a guardar, como cadena.
   *
   * Los props son arrays: cambian de identidad en cada render de Ranking aunque
   * el contenido sea el mismo, así que no se pueden usar como dependencias de
   * un efecto. Comparar la firma sí funciona.
   *
   * torneo_id queda fuera a propósito. Al guardar un torneo nuevo, Ranking
   * apunta el id devuelto para poder continuarlo, y eso cambiaría la firma y
   * borraría el mensaje de "guardado" justo después de mostrarlo.
   */
  const firma = useMemo(
    () => JSON.stringify({ filas, descripcion, fecha, nivel, isRanked }),
    [filas, descripcion, fecha, nivel, isRanked]
  );

  const clavejugadores = useMemo(() => jugadores.join("\u0000"), [jugadores]);

  // Aviso de nombres no registrados. La lectura es pública, así que se puede
  // comprobar sin haber entrado todavía.
  useEffect(() => {
    const nombres = clavejugadores ? clavejugadores.split("\u0000") : [];

    if (!auth.configured || nombres.length === 0) {
      setNuevos([]);
      return;
    }

    let cancelado = false;

    jugadoresDesconocidos(nombres)
      .then((desconocidos) => {
        if (!cancelado) setNuevos(desconocidos);
      })
      .catch(() => {
        // Si la comprobación previa falla no se bloquea nada: crear_torneo()
        // vuelve a comprobarlo en el servidor, que es donde cuenta.
        if (!cancelado) setNuevos([]);
      });

    return () => {
      cancelado = true;
    };
  }, [auth.configured, clavejugadores]);

  // Un cambio en los datos invalida el resultado anterior: lo que hay en
  // pantalla ya no es lo que se guardó. Y vuelve a habilitar el botón, que es
  // lo que impide insertar dos veces el mismo lote de un doble clic.
  useEffect(() => {
    setEstado("idle");
    setMensaje(null);
    setResultado(null);
  }, [firma]);

  const handleGuardar = useCallback(async () => {
    setEstado("enviando");
    setMensaje(null);

    try {
      const r = await crearTorneo(
        {
          torneo_id: torneoId,
          descripcion,
          fecha,
          scoring_system: scoringSystem,
          nivel,
          is_ranked: isRanked,
          filas,
        },
        confirmarNuevos && nuevos.length > 0
      );

      setResultado(r);
      setEstado("ok");
      setConfirmarNuevos(false);
      onGuardado(r);
    } catch (e: unknown) {
      setMensaje(e instanceof Error ? e.message : String(e));
      setEstado("error");
    }
  }, [
    confirmarNuevos,
    descripcion,
    fecha,
    filas,
    isRanked,
    nivel,
    nuevos.length,
    onGuardado,
    scoringSystem,
    torneoId,
  ]);

  if (!auth.configured) {
    return (
      <div className="mt-5 p-3 border border-gray-300 rounded text-sm text-gray-600 text-start">
        Guardar en la base de datos está desactivado: faltan las variables
        <code className="mx-1">VITE_SUPABASE_URL</code>y
        <code className="mx-1">VITE_SUPABASE_PUBLISHABLE_KEY</code>. Usa el
        bloque de SQL de arriba.
      </div>
    );
  }

  const sinDatos = filas.length === 0;
  const faltaConfirmarNuevos = nuevos.length > 0 && !confirmarNuevos;
  const puedeGuardar =
    auth.isOrganiser === true &&
    !sinDatos &&
    !faltaConfirmarNuevos &&
    estado !== "enviando" &&
    estado !== "ok";

  return (
    <div className="mt-5 p-3 border border-gray-300 rounded text-start">
      <h3 className="text-lg font-medium">Guardar en la base de datos</h3>

      {/* ---------------------------------------------------------------- */}
      {/* Sesión                                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
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
      </div>

      {auth.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {auth.error}
        </p>
      )}

      {auth.session && auth.isOrganiser === null && (
        <p className="mt-2 text-sm text-gray-500">Comprobando permisos...</p>
      )}

      {auth.session && auth.isOrganiser === false && (
        <p role="alert" className="mt-2 text-sm text-yellow-800">
          La cuenta <strong>{auth.email}</strong> no está en la lista de
          organizadores, así que no puede insertar. Pide que añadan ese correo a{" "}
          <code>jugadores.email</code>, o usa el bloque de SQL de arriba.
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Qué se va a guardar                                               */}
      {/* ---------------------------------------------------------------- */}
      {auth.isOrganiser === true && (
        <>
          <dl className="mt-3 text-sm text-gray-700 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-medium">Torneo</dt>
            <dd>
              {torneoId === null
                ? "nuevo"
                : `continuación del ${torneoId}`}
            </dd>

            <dt className="font-medium">Descripción</dt>
            <dd>{descripcion || <em>sin descripción</em>}</dd>

            <dt className="font-medium">Fecha</dt>
            <dd>{fecha}</dd>

            <dt className="font-medium">Nivel</dt>
            <dd>{nivel}</dd>

            <dt className="font-medium">Ranked</dt>
            <dd>{isRanked ? "sí" : "no"}</dd>

            <dt className="font-medium">Rondas</dt>
            <dd>
              {rondas.length === 0 ? "ninguna" : rondas.join(", ")} (
              {filas.length} filas)
            </dd>
          </dl>

          {sinDatos && (
            <p className="mt-2 text-sm text-gray-600">
              No hay ninguna ronda rellenada todavía.
            </p>
          )}

          {nuevos.length > 0 && (
            <div className="mt-3 p-2 rounded bg-yellow-100 text-yellow-900 border border-yellow-300 text-sm">
              <p>
                Estos nombres no están en la base de datos:{" "}
                <strong>{nuevos.join(", ")}</strong>. Si es una errata,
                corrígela antes de guardar: se crearía un jugador nuevo y sus
                puntos no contarían para el ranking del jugador real.
              </p>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={confirmarNuevos}
                  onChange={(e) => setConfirmarNuevos(e.target.checked)}
                />
                <span>
                  Los nombres son correctos, crear{" "}
                  {nuevos.length === 1 ? "el jugador" : "los jugadores"}
                </span>
              </label>
            </div>
          )}

          <button
            type="button"
            className="mt-3 px-4 py-2 text-sm font-medium text-white bg-green-700 rounded-lg hover:bg-green-800 focus:ring-4 focus:outline-none focus:ring-green-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
            onClick={handleGuardar}
            disabled={!puedeGuardar}
          >
            {estado === "enviando"
              ? "Guardando..."
              : estado === "ok"
              ? "Guardado"
              : "Insertar partidas en la BD"}
          </button>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Resultado                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div aria-live="polite">
        {estado === "ok" && resultado && (
          <div className="mt-3 p-2 rounded bg-green-100 text-green-900 border border-green-300 text-sm">
            <p>
              Guardado en el torneo <strong>{resultado.torneo_id}</strong>
              {resultado.torneo_creado ? " (creado ahora)" : ""}:{" "}
              {resultado.puntuaciones_insertadas} puntuaciones en la
              {resultado.partidas.length === 1 ? " partida " : "s partidas "}
              {resultado.partidas.join(", ")}.
            </p>
            <p className="mt-1">
              Jugadores actualizados: {resultado.jugadores_actualizados}.
              {resultado.jugadores_creados.length > 0 &&
                ` Creados: ${resultado.jugadores_creados.join(", ")}.`}
            </p>
          </div>
        )}

        {estado === "error" && mensaje && (
          <div
            role="alert"
            className="mt-3 p-2 rounded bg-red-100 text-red-900 border border-red-300 text-sm"
          >
            <p className="font-medium">No se ha guardado nada.</p>
            <p className="mt-1">{mensaje}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GuardarPartida;
