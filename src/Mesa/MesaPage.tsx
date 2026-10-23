import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Personaje, PersonajeFragmentoTexto } from "../data";
import {
  crearSearchFicha,
  leerAsientosMesa,
  leerFilaFicha,
  posicionAsiento,
  quitarFilaFicha,
} from "./mesa";
import "./Mesa.css";

type PanelFicha = "faq" | "lore" | "metadata";

function estilosFragmento(fragmento: PersonajeFragmentoTexto): CSSProperties {
  const estilo: CSSProperties = {};
  if (fragmento.negrita) estilo.fontWeight = 700;
  if (fragmento.cursiva) estilo.fontStyle = "italic";
  if (fragmento.subrayado || fragmento.tachado) {
    estilo.textDecorationLine = [
      fragmento.subrayado ? "underline" : "",
      fragmento.tachado ? "line-through" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (fragmento.subrayado === "double") estilo.textDecorationStyle = "double";
    if (fragmento.subrayado === "dotted") estilo.textDecorationStyle = "dotted";
    if (fragmento.subrayado === "dashed") estilo.textDecorationStyle = "dashed";
    if (fragmento.subrayado === "wavy") estilo.textDecorationStyle = "wavy";
  }
  if (fragmento.color && /^#[\da-f]{6}$/i.test(fragmento.color)) {
    estilo.color = fragmento.color;
  }
  if (fragmento.familiaFuente) {
    const familia = fragmento.familiaFuente.replace(/[^a-z\d _-]/gi, "").trim();
    if (familia) estilo.fontFamily = `"${familia}", sans-serif`;
  }
  if (
    fragmento.tamanoFuentePuntos &&
    Number.isFinite(fragmento.tamanoFuentePuntos)
  ) {
    estilo.fontSize = `${fragmento.tamanoFuentePuntos}pt`;
  }
  if (fragmento.alineacionVertical) {
    estilo.verticalAlign = fragmento.alineacionVertical === "superscript" ? "super" : "sub";
    estilo.fontSize = "smaller";
  }
  return estilo;
}

function renderTextoExcel(
  texto: string | null | undefined,
  fragmentos: PersonajeFragmentoTexto[] | null | undefined
): React.ReactNode {
  if (fragmentos?.length) {
    return fragmentos.map((fragmento, indice) => (
      <span key={`${indice}-${fragmento.texto}`} style={estilosFragmento(fragmento)}>
        {fragmento.texto}
      </span>
    ));
  }
  return texto;
}

export default function MesaPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const asientosDesdeUrl = useMemo(
    () => leerAsientosMesa(location.search),
    [location.search]
  );
  const totalJugadores = asientosDesdeUrl?.length ?? 0;
  const filaSeleccionada = leerFilaFicha(location.search);
  const desdeMesa =
    typeof location.state === "object" &&
    location.state !== null &&
    "desdeMesa" in location.state &&
    location.state.desdeMesa === true;
  const [personajes, setPersonajes] = useState<Personaje[] | null>(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [panelFicha, setPanelFicha] = useState<PanelFicha | null>(null);

  useEffect(() => {
    let activa = true;
    import("../data/personajes")
      .then(({ cargarPersonajes }) => cargarPersonajes())
      .then((catalogo) => {
        if (activa) setPersonajes(catalogo);
      })
      .catch((error: unknown) => {
        if (activa) {
          setErrorCarga(
            error instanceof Error
              ? error.message
              : "No se pudo cargar el catálogo de personajes."
          );
        }
      });
    return () => {
      activa = false;
    };
  }, []);

  const personajesPorFila = useMemo(
    () => new Map(personajes?.map((personaje) => [personaje.filaExcel, personaje]) ?? []),
    [personajes]
  );
  const ficha = filaSeleccionada === null
    ? undefined
    : personajesPorFila.get(filaSeleccionada);

  const volverAMesa = useCallback(() => {
    setPanelFicha(null);
    if (desdeMesa) {
      navigate(-1);
      return;
    }
    if (!asientosDesdeUrl) {
      navigate("/ranking", { replace: true });
      return;
    }
    navigate(
      {
        pathname: location.pathname,
        search: quitarFilaFicha(location.search),
      },
      { replace: true, state: null }
    );
  }, [
    asientosDesdeUrl,
    desdeMesa,
    location.pathname,
    location.search,
    navigate,
  ]);

  useEffect(() => {
    if (filaSeleccionada === null) return;
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      if (panelFicha !== null) {
        setPanelFicha(null);
      } else {
        volverAMesa();
      }
    };
    window.addEventListener("keydown", cerrarConEscape);
    return () => window.removeEventListener("keydown", cerrarConEscape);
  }, [filaSeleccionada, panelFicha, volverAMesa]);

  useEffect(() => {
    setPanelFicha(null);
  }, [filaSeleccionada]);

  if (!asientosDesdeUrl && filaSeleccionada === null) {
    return (
      <main className={filaSeleccionada === null ? "mesa-page" : "ficha-pagina"}>
        <section className="mesa-message" role="alert">
          <h1>Enlace de mesa no válido</h1>
          <p>El enlace debe incluir entre 5 y 10 jugadores y sus personajes.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mesa-page">
      {errorCarga && (
        <p className="mesa-error" role="alert">
          No se pudo cargar el catálogo de personajes: {errorCarga}
        </p>
      )}
      {filaSeleccionada === null ? (
        <section className="mesa-board" aria-label="Jugadores sentados alrededor de la mesa">
          <div className="mesa-superficie" aria-hidden="true" />
          {asientosDesdeUrl?.map((asiento, indice) => {
            const anchoAsiento = Math.min(
              30,
              16 + (10 - totalJugadores) * 2.5
            );
            const { x, y } = posicionAsiento(
              indice,
              totalJugadores,
              anchoAsiento
            );
            const personaje = asiento.filaPersonaje
              ? personajesPorFila.get(asiento.filaPersonaje)
              : undefined;
            const tituloPersonaje = asiento.filaPersonaje
              ? personajes === null
                ? "Cargando…"
                : personaje?.nombre ?? `Fila ${asiento.filaPersonaje} no encontrada`
              : "pendiente";

            return (
              <button
                type="button"
                className="mesa-asiento"
                key={`${asiento.jugadorId}-${indice}`}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: `${anchoAsiento}%`,
                }}
                aria-label={`${asiento.jugadorId}, ${tituloPersonaje}`}
                disabled={asiento.filaPersonaje === null}
                onClick={() => {
                  if (asiento.filaPersonaje !== null) {
                    navigate(
                      {
                        pathname: location.pathname,
                        search: crearSearchFicha(location.search, asiento.filaPersonaje),
                      },
                      { state: { desdeMesa: true } }
                    );
                    setPanelFicha(null);
                  }
                }}
              >
                <span className="mesa-numero">{indice + 1}</span>
                <strong className="mesa-jugador">{asiento.jugadorId}</strong>
                <span
                  className={`mesa-personaje ${personaje ? "" : "mesa-pendiente"}`}
                  title={tituloPersonaje}
                >
                  {tituloPersonaje}
                </span>
              </button>
            );
          })}
        </section>
      ) : (
        <section
          aria-labelledby="ficha-titulo"
        >
          <div className="ficha-contenedor">
            <header className="ficha-cabecera">
              <div className="ficha-titulo-y-atributos">
                <h1 id="ficha-titulo">{ficha?.nombre ?? "Ficha de personaje"}</h1>
                {ficha && (
                  <div className="ficha-atributos" aria-label="Atributos del personaje">
                    {ficha.hp && <span>({ficha.hp} HP)</span>}
                    {ficha.shield && (
                      <span aria-label={`Escudo ${ficha.shield}`}>🛡️ {ficha.shield}</span>
                    )}
                    {ficha.charges && <span><strong>⚡</strong> {ficha.charges}</span>}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="ficha-volver"
                autoFocus
                onClick={volverAMesa}
                aria-label="Volver a la mesa"
              >
                ← Mesa
              </button>
            </header>

            {personajes === null ? (
              <p className="ficha-estado" role="status">Cargando personaje…</p>
            ) : !ficha ? (
              <p className="ficha-estado" role="alert">
                No se ha podido encontrar la ficha de este personaje.
              </p>
            ) : (
              <>
                <div className="ficha-cuerpo">
                  <div className="ficha-contenido">
                    <section className="ficha-seccion">
                      <p className="ficha-skills">
                        {renderTextoExcel(ficha.skills, ficha.skillsRichText) ||
                          "Sin información disponible."}
                      </p>
                    </section>
                    {ficha.additionalSkills?.trim() && (
                      <section className="ficha-seccion">
                        <h2>Additional skills</h2>
                        <p className="ficha-skills">
                          {renderTextoExcel(
                            ficha.additionalSkills,
                            ficha.additionalSkillsRichText
                          )}
                        </p>
                      </section>
                    )}
                  </div>

                  <nav className="ficha-navegacion" aria-label="Información adicional">
                    <button type="button" onClick={() => setPanelFicha("faq")}>FAQ</button>
                    <button type="button" onClick={() => setPanelFicha("lore")}>LORE</button>
                    <button type="button" onClick={() => setPanelFicha("metadata")}>Metadata</button>
                  </nav>
                </div>

                {panelFicha !== null && (
                  <aside className="ficha-panel" aria-label={`Panel ${panelFicha}`}>
                    <header className="ficha-panel-cabecera">
                      <button type="button" onClick={() => setPanelFicha(null)}>
                        ← <span>Volver a la ficha</span>
                      </button>
                      <button
                        type="button"
                        className="ficha-cerrar"
                        onClick={volverAMesa}
                        aria-label="Volver a la mesa"
                      >
                        ×
                      </button>
                    </header>
                    <div className="ficha-panel-contenido">
                      {panelFicha === "faq" && (
                        <>
                          <h2>FAQ</h2>
                          <p>
                            {renderTextoExcel(ficha.faq, ficha.faqRichText) ||
                              "Sin información disponible."}
                          </p>
                        </>
                      )}
                      {panelFicha === "lore" && (
                        <>
                          <h2>LORE</h2>
                          <p>
                            {renderTextoExcel(ficha.lore, ficha.loreRichText) ||
                              "Sin información disponible."}
                          </p>
                        </>
                      )}
                      {panelFicha === "metadata" && (
                        <>
                          <h2>Metadata</h2>
                          <dl className="ficha-metadata">
                            <dt>Servidor</dt>
                            <dd>{ficha.servidor || "—"}</dd>
                            <dt>Expansión</dt>
                            <dd>{ficha.expansion || "—"}</dd>
                            <dt>Versión</dt>
                            <dd>{ficha.version || "—"}</dd>
                          </dl>
                        </>
                      )}
                    </div>
                  </aside>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
