import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthState } from "../supabase/useAuth";
import {
  avisarPartida,
  crearTorneo,
  jugadoresDesconocidos,
  type CrearTorneoResultado,
  type FilaPuntuacion,
  type MuertoAviso,
  type PartidaPayload,
} from "../supabase/crearTorneo";
import { etiquetaRonda } from "./formatoRawData";

interface GuardarPartidaProps {
  /**
   * El estado de sesión, elevado a Ranking para que haya una sola instancia de
   * useAuth() compartida con la cabecera (SesionOrganizador) y el modal de
   * ronda. La UI de login ya no vive aquí; este componente sólo consume la
   * sesión para decidir si puede guardar.
   */
  auth: AuthState;
  /** Las filas ya emparejadas jugador-puntuación. */
  filas: FilaPuntuacion[];
  /**
   * Quién murió en cada ronda (`muertosDeFilas`). Sólo para el aviso de
   * Telegram: la muerte no se guarda ni se envía a crear_torneo().
   */
  muertos: MuertoAviso[];
  /**
   * Nivel y ranked de cada ronda de `filas`, de `datosDePartidas()`. Es de cada
   * partida, no de la sesión: alguien puede subir de nivel a mitad del torneo.
   */
  partidas: PartidaPayload[];
  /** Rondas con filas pero sin nivel o ranked apuntados: impiden guardar. */
  rondasIncompletas: number[];
  /** Los jugadores de la mesa, para avisar de nombres no registrados. */
  jugadores: string[];
  /** null crea un torneo nuevo; un número continúa uno existente. */
  torneoId: number | null;
  descripcion: string;
  fecha: string;
  scoringSystem: string;
  /** Se llama tras un alta correcta, para fijar la continuación del torneo. */
  onGuardado: (resultado: CrearTorneoResultado) => void;
}

type Estado = "idle" | "enviando" | "ok" | "error";

/**
 * El aviso al grupo de Telegram, aparte del estado de guardado.
 *
 * Son dos cosas independientes y no se mezclan a propósito: cuando el aviso se
 * intenta, la partida ya está insertada y confirmada. Si fallara y se pintase
 * como error, daría a entender que no se ha guardado, y alguien volvería a
 * intentarlo.
 */
type EstadoAviso = "idle" | "enviando" | "ok" | "error";

const GuardarPartida = ({
  auth,
  filas,
  muertos,
  partidas,
  rondasIncompletas,
  jugadores,
  torneoId,
  descripcion,
  fecha,
  scoringSystem,
  onGuardado,
}: GuardarPartidaProps) => {
  const [estado, setEstado] = useState<Estado>("idle");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CrearTorneoResultado | null>(null);
  const [nuevos, setNuevos] = useState<string[]>([]);
  const [confirmarNuevos, setConfirmarNuevos] = useState<boolean>(false);
  const [aviso, setAviso] = useState<EstadoAviso>("idle");
  const [avisoMensaje, setAvisoMensaje] = useState<string | null>(null);

  const rondas = Array.from(new Set(filas.map((f) => f.num_partida))).sort(
    (a, b) => a - b
  );
  const conPersonaje = filas.filter((f) => f.personaje).length;
  const datosRonda = new Map(partidas.map((p) => [p.num_partida, p]));

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
    () => JSON.stringify({ filas, muertos, partidas, descripcion, fecha }),
    [filas, muertos, partidas, descripcion, fecha]
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
    setAviso("idle");
    setAvisoMensaje(null);
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
          partidas,
          filas,
        },
        confirmarNuevos && nuevos.length > 0
      );

      setResultado(r);
      setEstado("ok");
      setConfirmarNuevos(false);
      onGuardado(r);

      // El aviso va DESPUÉS y en su propio try: lo que se guarda ya está
      // guardado, y un fallo al avisar no puede tocar el estado de guardado.
      setAviso("enviando");
      setAvisoMensaje(null);
      try {
        await avisarPartida(r.torneo_id, r.partidas, muertos);
        setAviso("ok");
      } catch (e: unknown) {
        setAvisoMensaje(e instanceof Error ? e.message : String(e));
        setAviso("error");
      }
    } catch (e: unknown) {
      setMensaje(e instanceof Error ? e.message : String(e));
      setEstado("error");
    }
  }, [
    confirmarNuevos,
    descripcion,
    fecha,
    filas,
    muertos,
    partidas,
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
    rondasIncompletas.length === 0 &&
    !faltaConfirmarNuevos &&
    estado !== "enviando" &&
    estado !== "ok";

  return (
    <div className="mt-5 p-3 border border-gray-300 rounded text-start">
      <h3 className="text-lg font-medium">Guardar en la base de datos</h3>

      {/*
        La sesión (entrar con Google, quién soy, salir, permisos) vive ahora en
        SesionOrganizador, arriba en la cabecera de Ranking, para que al abrir
        el modal de ronda el usuario ya pueda estar identificado. Aquí sólo se
        consume `auth` para saber si se puede guardar.
      */}
      {!auth.ready && (
        <p className="mt-2 text-sm text-gray-500">Comprobando sesión...</p>
      )}

      {auth.ready && !auth.session && (
        <p className="mt-2 text-sm text-gray-600">
          Identifícate arriba con Google para poder guardar.
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

            <dt className="font-medium">Partidas</dt>
            <dd>
              {rondas.length === 0 ? (
                "ninguna"
              ) : (
                <>
                  {rondas.join(", ")} ({filas.length} filas)
                  <ul className="mt-1">
                    {rondas.map((ronda) => {
                      const d = datosRonda.get(ronda);
                      return (
                        <li
                          key={ronda}
                          className={d ? undefined : "text-red-700"}
                        >
                          {etiquetaRonda(
                            ronda,
                            d ? { nivel: d.nivel, isRanked: d.is_ranked } : null
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </dd>

            <dt className="font-medium">Personajes</dt>
            <dd>
              {conPersonaje} de {filas.length} filas
            </dd>
          </dl>

          {/* Detalle por partida, sólo si hay algo que enseñar. */}
          {conPersonaje > 0 && (
            <details className="mt-2 text-sm text-gray-700">
              <summary className="cursor-pointer">Personajes por partida</summary>
              <ul className="mt-1 ml-4 list-disc">
                {rondas.map((ronda) => (
                  <li key={ronda}>
                    Partida {ronda}:{" "}
                    {filas
                      .filter((f) => f.num_partida === ronda)
                      .map((f) => `${f.jugador} → ${f.personaje ?? "—"}`)
                      .join(", ")}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {sinDatos && (
            <p className="mt-2 text-sm text-gray-600">
              No hay ninguna partida rellenada todavía.
            </p>
          )}

          {rondasIncompletas.length > 0 && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {rondasIncompletas.length === 1 ? "La partida " : "Las partidas "}
              {rondasIncompletas.join(", ")}{" "}
              {rondasIncompletas.length === 1 ? "no tiene" : "no tienen"} nivel
              o ranked apuntados. Ábrela con el botón + de la tabla y dale a
              Submit.
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
            {resultado.jugadores_creados.length > 0 && (
              <p className="mt-1">
                Jugadores creados: {resultado.jugadores_creados.join(", ")}.
              </p>
            )}

            {/*
              El aviso al grupo va dentro del recuadro verde, no en uno propio:
              es una consecuencia de haber guardado, no otra operación. Y si
              falla se dice en amarillo, nunca en rojo: la partida está dentro.
            */}
            {aviso === "enviando" && (
              <p className="mt-1 text-gray-600">Avisando al grupo…</p>
            )}
            {aviso === "ok" && (
              <p className="mt-1">📣 Avisado al grupo de Telegram.</p>
            )}
            {aviso === "error" && (
              <p className="mt-1 rounded bg-yellow-100 p-2 text-yellow-900">
                ⚠️ La partida está guardada, pero <strong>no</strong> se ha podido
                avisar al grupo de Telegram. Cópiale el Raw Data de abajo si
                quieres que se enteren.
                {avisoMensaje && (
                  <span className="mt-1 block text-xs opacity-75">
                    Detalle: {avisoMensaje}
                  </span>
                )}
              </p>
            )}
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
