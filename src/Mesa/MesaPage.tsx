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
  siguienteFilaFicha,
} from "./mesa";
import { crearEnlacesChinos } from "./enlacesChinos";
import "./Mesa.css";

type PanelFicha = "faq" | "lore" | "metadata" | "chino";

/** Tamaños en rem del texto de habilidades; el índice 1 (1.2rem) es el base. */
const PASOS_TAMANO = [1, 1.2, 1.4, 1.6, 1.8];
const INDICE_TAMANO_BASE = 1;
const CLAVE_TAMANO = "mesaFichaSkillsSize-v1";

function leerIndiceTamano(): number {
  try {
    const crudo = window.localStorage.getItem(CLAVE_TAMANO);
    if (crudo === null) return INDICE_TAMANO_BASE;
    const indice = Number(crudo);
    return Number.isInteger(indice) && indice >= 0 && indice < PASOS_TAMANO.length
      ? indice
      : INDICE_TAMANO_BASE;
  } catch {
    // Sin almacenamiento o sin permiso: tamaño base. La ficha sigue funcionando.
    return INDICE_TAMANO_BASE;
  }
}

function escribirIndiceTamano(indice: number): void {
  try {
    window.localStorage.setItem(CLAVE_TAMANO, String(indice));
  } catch {
    // Sin sitio o sin permiso: la preferencia dura lo que dure la pestaña.
  }
}

function estilosFragmento(
  fragmento: PersonajeFragmentoTexto,
  omitirTamano = false
): CSSProperties {
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
  // En skills se omite el tamaño absoluto del Excel para que el zoom (la
  // variable --ficha-skills-size del párrafo) mande. El super/subíndice se
  // mantiene porque "smaller" es relativo al texto heredado.
  if (
    !omitirTamano &&
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
  fragmentos: PersonajeFragmentoTexto[] | null | undefined,
  omitirTamano = false
): React.ReactNode {
  if (fragmentos?.length) {
    return fragmentos.map((fragmento, indice) => (
      <span
        key={`${indice}-${fragmento.texto}`}
        style={estilosFragmento(fragmento, omitirTamano)}
      >
        {fragmento.texto}
      </span>
    ));
  }
  return texto;
}

/** Lupa con un signo dentro (− para reducir, + para aumentar). */
function IconoLupa({ signo }: { signo: "mas" | "menos" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <line
        x1="14.8"
        y1="14.8"
        x2="20.5"
        y2="20.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="7"
        y1="10"
        x2="13"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {signo === "mas" && (
        <line
          x1="10"
          y1="7"
          x2="10"
          y2="13"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
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
  const [menuInformacionVisible, setMenuInformacionVisible] = useState(false);
  const [jugadorPerspectiva, setJugadorPerspectiva] = useState<string | null>(null);
  const [selectorPerspectivaAbierto, setSelectorPerspectivaAbierto] = useState(false);
  const [indiceTamano, setIndiceTamano] = useState(leerIndiceTamano);

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
  const indicePerspectiva = jugadorPerspectiva === null
    ? null
    : asientosDesdeUrl?.findIndex(
        ({ jugadorId }) => jugadorId === jugadorPerspectiva
      ) ?? -1;
  const filaSiguiente = useMemo(
    () =>
      asientosDesdeUrl && filaSeleccionada !== null
        ? siguienteFilaFicha(asientosDesdeUrl, filaSeleccionada)
        : null,
    [asientosDesdeUrl, filaSeleccionada]
  );

  // Grupos flotantes sobre la ficha; se ocultan con un panel abierto para no
  // taparlo. Los botones de tamaño salen siempre que hay ficha; "Siguiente"
  // sólo si queda otro personaje.
  const mostrarFlotantes = Boolean(ficha) && panelFicha === null;
  const mostrarSiguiente = mostrarFlotantes && filaSiguiente !== null;

  const irAlSiguientePersonaje = useCallback(() => {
    if (filaSiguiente === null) return;
    navigate(
      {
        pathname: location.pathname,
        search: crearSearchFicha(location.search, filaSiguiente),
      },
      { replace: true, state: { desdeMesa: true } }
    );
  }, [filaSiguiente, location.pathname, location.search, navigate]);

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
    setMenuInformacionVisible(false);
  }, [filaSeleccionada]);

  useEffect(() => {
    escribirIndiceTamano(indiceTamano);
  }, [indiceTamano]);

  useEffect(() => {
    if (!selectorPerspectivaAbierto) return;
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setSelectorPerspectivaAbierto(false);
    };
    window.addEventListener("keydown", cerrarConEscape);
    return () => window.removeEventListener("keydown", cerrarConEscape);
  }, [selectorPerspectivaAbierto]);

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
          <div className="mesa-selector-perspectiva">
            <button
              type="button"
              className="mesa-selector-perspectiva-boton"
              aria-label="Elegir perspectiva de la mesa"
              aria-expanded={selectorPerspectivaAbierto}
              aria-controls="mesa-selector-jugadores"
              onClick={() => setSelectorPerspectivaAbierto((abierto) => !abierto)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
              >
                <path
                  d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
            {selectorPerspectivaAbierto && (
              <div
                id="mesa-selector-jugadores"
                className="mesa-selector-perspectiva-menu"
                role="group"
                aria-label="Elegir jugador para orientar la mesa"
              >
                {asientosDesdeUrl?.map((asiento) => (
                  <button
                    type="button"
                    className="mesa-selector-jugador"
                    key={asiento.jugadorId}
                    aria-pressed={jugadorPerspectiva === asiento.jugadorId}
                    onClick={() => {
                      setJugadorPerspectiva(asiento.jugadorId);
                      setSelectorPerspectivaAbierto(false);
                    }}
                  >
                    {asiento.jugadorId}
                  </button>
                ))}
              </div>
            )}
          </div>
          {asientosDesdeUrl?.map((asiento, indice) => {
            const anchoAsiento = Math.min(
              30,
              16 + (10 - totalJugadores) * 2.5
            );
            const { x, y } = posicionAsiento(
              indice,
              totalJugadores,
              anchoAsiento,
              indicePerspectiva === null || indicePerspectiva < 0
                ? null
                : indicePerspectiva
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
          <div
            className="ficha-contenedor"
            style={
              {
                "--ficha-skills-size": `${PASOS_TAMANO[indiceTamano]}rem`,
              } as CSSProperties
            }
          >
            <header className="ficha-cabecera">
              <div className="ficha-titulo-y-atributos">
                <h1 id="ficha-titulo">
                  {ficha?.nombre ?? "Ficha de personaje"}
                  {ficha && (ficha.hp || ficha.shield || ficha.charges) && (
                    <span className="ficha-atributos" aria-label="Atributos del personaje">
                      {(ficha.hp || ficha.shield) && (
                        <span>
                          (
                          {ficha.hp && `${ficha.hp} HP`}
                          {ficha.hp && ficha.shield && " "}
                          {ficha.shield && (
                            <span aria-label={`Escudo ${ficha.shield}`}>
                              {ficha.shield}🛡️
                            </span>
                          )}
                          )
                        </span>
                      )}
                      {ficha.charges && <span>({ficha.charges} charges)</span>}
                    </span>
                  )}
                </h1>
                {ficha?.shortLore?.trim() && (
                  <p className="ficha-shortlore">{ficha.shortLore}</p>
                )}
              </div>
              {ficha && (
                <div className="ficha-acciones">
                  <button
                    type="button"
                    className="ficha-info-toggle"
                    aria-expanded={menuInformacionVisible}
                    aria-controls="ficha-navegacion"
                    onClick={() =>
                      setMenuInformacionVisible((visible) => !visible)
                    }
                  >
                    {menuInformacionVisible ? "Ver menos" : "Ver más"}
                  </button>
                </div>
              )}
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
                  <div
                    className={`ficha-contenido${
                      mostrarFlotantes ? " ficha-contenido--con-siguiente" : ""
                    }`}
                  >
                    <section className="ficha-seccion">
                      <p className="ficha-skills">
                        {renderTextoExcel(
                          ficha.skills,
                          ficha.skillsRichText,
                          true
                        ) || "Sin información disponible."}
                      </p>
                      {ficha.additionalSkills?.trim() && (
                        <p className="ficha-skills">
                          {renderTextoExcel(
                            ficha.additionalSkills,
                            ficha.additionalSkillsRichText,
                            true
                          )}
                        </p>
                      )}
                    </section>
                  </div>

                  <nav
                    id="ficha-navegacion"
                    className="ficha-navegacion"
                    aria-label="Información adicional"
                    hidden={!menuInformacionVisible}
                  >
                    {ficha.faq?.trim() && (
                      <button type="button" onClick={() => setPanelFicha("faq")}>FAQ</button>
                    )}
                    {ficha.lore?.trim() && (
                      <button type="button" onClick={() => setPanelFicha("lore")}>LORE</button>
                    )}
                    <button type="button" onClick={() => setPanelFicha("metadata")}>Metadata</button>
                    {ficha.nombreDorso?.trim() && (
                      <button type="button" onClick={() => setPanelFicha("chino")}>Chino</button>
                    )}
                  </nav>
                </div>

                {panelFicha !== null && (
                  <aside className="ficha-panel" aria-label={`Panel ${panelFicha}`}>
                    <header className="ficha-panel-cabecera">
                      <button type="button" onClick={() => setPanelFicha(null)}>
                        ← <span>Volver a la ficha</span>
                      </button>
                    </header>
                    <div className="ficha-panel-contenido">
                      {panelFicha === "faq" && (
                        <>
                          <h2>FAQ</h2>
                          <p className="ficha-faq-texto">
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
                            <dt>wgt</dt>
                            <dd>{ficha.nivel ?? "—"}</dd>
                            <dt>Alternativas</dt>
                            <dd>{ficha.alternativeVersions || "—"}</dd>
                          </dl>
                        </>
                      )}
                      {panelFicha === "chino" && (
                        <>
                          <h2>Chino</h2>
                          <ul className="ficha-enlaces-chinos">
                            {crearEnlacesChinos(
                              ficha.nombreDorso,
                              ficha.servidor
                            ).map((enlace) => (
                              <li key={enlace.texto}>
                                <a
                                  href={enlace.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {enlace.texto}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </aside>
                )}
              </>
            )}
            {mostrarSiguiente && (
              <button
                type="button"
                className="ficha-boton-siguiente"
                aria-label="Siguiente personaje"
                onClick={irAlSiguientePersonaje}
              >
                Siguiente
                <span aria-hidden="true"> →</span>
              </button>
            )}
            {mostrarFlotantes && (
              <div
                className="ficha-tamano"
                role="group"
                aria-label="Tamaño del texto de habilidades"
              >
                <button
                  type="button"
                  aria-label="Reducir tamaño del texto"
                  disabled={indiceTamano === 0}
                  onClick={() =>
                    setIndiceTamano((indice) => Math.max(0, indice - 1))
                  }
                >
                  <IconoLupa signo="menos" />
                </button>
                <button
                  type="button"
                  aria-label="Aumentar tamaño del texto"
                  disabled={indiceTamano === PASOS_TAMANO.length - 1}
                  onClick={() =>
                    setIndiceTamano((indice) =>
                      Math.min(PASOS_TAMANO.length - 1, indice + 1)
                    )
                  }
                >
                  <IconoLupa signo="mas" />
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
