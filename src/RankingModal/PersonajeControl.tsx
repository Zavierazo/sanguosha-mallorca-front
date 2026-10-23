import React, { useMemo } from "react";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  and,
  isStringControl,
  optionIs,
  rankWith,
  type ControlProps,
  type RankedTester,
} from "@jsonforms/core";
import { withJsonFormsControlProps } from "@jsonforms/react";
import {
  GRUPO_OTROS,
  claveOpcionPersonaje,
  etiquetaOpcionPersonaje,
  filaExcelPersonajePorNivel,
  grupoDelNivel,
  sugerenciasPersonajeCompartidas,
  type PersonajeCatalogo,
  type OpcionPersonaje,
} from "../Ranking/personajes";

const filtrarOpciones = createFilterOptions<OpcionPersonaje>({ limit: 100 });
const opcionesVacias: OpcionPersonaje[] = [];

/**
 * Lo que el modal pasa en el `config` de JsonForms para este control.
 *
 * Va por `config` y no cerrando el renderer sobre las props del modal porque un
 * renderer nuevo en cada render obligaría a JsonForms a desmontar y volver a
 * montar el campo, y el Autocomplete perdería el foco a mitad de escribir.
 */
export interface ConfigPersonaje {
  /** null: el catálogo no ha cargado (o falló). El campo se deshabilita. */
  personajes: PersonajeCatalogo[] | null;
  /** El nivel del desplegable de la partida. */
  nivel: number;
  /** Fila de Excel seleccionada para cada jugador. */
  filasSeleccionadas: Record<string, number | null>;
  onCambiarFilaSeleccionada: (jugador: string, fila: number | null) => void;
}

/**
 * Campo de personaje: un Autocomplete de MUI que sugiere primero los del nivel
 * de la partida y debajo el resto del catálogo.
 *
 * Sin texto libre (`freeSolo` desactivado): sólo se puede elegir del catálogo,
 * que es lo mismo que exige crear_torneo(). Opcional: el aspa lo deja vacío.
 */
const PersonajeControlBase = ({
  data,
  handleChange,
  path,
  label,
  config,
  uischema,
  enabled,
}: ControlProps) => {
  const {
    personajes,
    nivel,
    filasSeleccionadas,
    onCambiarFilaSeleccionada,
  } = (config ?? {}) as Partial<ConfigPersonaje>;
  const jugador = (uischema.options?.jugador as string | undefined) ?? "";
  const valor = typeof data === "string" && data.trim() ? data.trim() : null;
  const [catalogoAbierto, setCatalogoAbierto] = React.useState(false);

  const opciones = useMemo<OpcionPersonaje[]>(() => {
    const base =
      catalogoAbierto && personajes
        ? sugerenciasPersonajeCompartidas(personajes, nivel ?? 0)
        : opcionesVacias;
    // Un valor que ya no está en el catálogo (se recargó después de apuntarlo)
    // se enseña igual, para que se vea y se pueda cambiar. Al guardar lo
    // rechazaría crear_torneo().
    if (valor && !base.some((o) => o.nombre.toLowerCase() === valor.toLowerCase())) {
      const filaPreferida = filasSeleccionadas?.[jugador];
      const filaResuelta =
        filaPreferida ??
        filaExcelPersonajePorNivel(personajes ?? [], valor, nivel ?? 0);
      const personajeSeleccionado = personajes?.find(
        (personaje) =>
          personaje.filaExcel === filaResuelta &&
          personaje.nombre.toLowerCase() === valor.toLowerCase()
      );
      return [...base, {
        nombre: valor,
        nivel: personajeSeleccionado?.nivel ?? nivel ?? 0,
        dinastia: personajeSeleccionado?.dinastia?.trim() || null,
        filaExcel: personajeSeleccionado?.filaExcel ?? null,
        delNivel: false,
      }];
    }
    return base;
  }, [catalogoAbierto, personajes, nivel, valor, filasSeleccionadas, jugador]);

  const seleccionada =
    valor === null
      ? null
      : opciones.find(
          (opcion) =>
            opcion.filaExcel === filasSeleccionadas?.[jugador] &&
            opcion.nombre.toLowerCase() === valor.toLowerCase()
        ) ??
        opciones.find((opcion) => opcion.filaExcel ===
          filaExcelPersonajePorNivel(personajes ?? [], valor, nivel ?? 0)) ??
        null;

  const sinCatalogo = personajes == null;
  const fueraDeCatalogo = seleccionada !== null && seleccionada.filaExcel === null;

  const ayuda = sinCatalogo
    ? "Lista de personajes no disponible"
    : fueraDeCatalogo
      ? "No está en el catálogo: cámbialo o déjalo en blanco"
      : undefined;

  return (
    <Autocomplete<OpcionPersonaje, false, false, false>
      options={opciones}
      filterOptions={filtrarOpciones}
      value={seleccionada}
      onOpen={() => setCatalogoAbierto(true)}
      onChange={(_, opcion) => {
        onCambiarFilaSeleccionada?.(jugador, opcion?.filaExcel ?? null);
        handleChange(path, opcion?.nombre ?? undefined);
      }}
      groupBy={(o) => (o.delNivel ? grupoDelNivel(nivel ?? 0) : GRUPO_OTROS)}
      getOptionLabel={etiquetaOpcionPersonaje}
      getOptionKey={claveOpcionPersonaje}
      isOptionEqualToValue={(a, b) =>
        a.filaExcel !== null && b.filaExcel !== null
          ? a.filaExcel === b.filaExcel
          : a.nombre.toLowerCase() === b.nombre.toLowerCase() && a.nivel === b.nivel
      }
      renderOption={(props, o) => {
        // `key` va aparte: MUI lo mete en props y React avisa si se esparce.
        const { key, ...resto } = props as typeof props & { key: React.Key };
        return (
          <li key={key} {...resto}>
            <span>{o.nombre}</span>
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: "0.8em", whiteSpace: "nowrap", ml: 1 }}
            >
              wgt {o.nivel}{o.dinastia ? `, ${o.dinastia}` : ""}
            </Typography>
          </li>
        );
      }}
      noOptionsText="Ningún personaje coincide"
      disabled={!enabled || sinCatalogo}
      autoHighlight
      size="small"
      // En el móvil el campo ocupa su propia línea (RankingModal.css) y un
      // mínimo fijo lo haría desbordar en las pantallas más estrechas.
      sx={{ minWidth: { xs: 0, sm: 220 }, width: "100%" }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label || "Personaje"}
          helperText={ayuda}
          error={fueraDeCatalogo}
          // inputProps y no slotProps.htmlInput: es lo que trae `params` del
          // Autocomplete, y hay que extenderlo, no sustituirlo, o se pierden
          // los manejadores de teclado del desplegable.
          inputProps={{
            ...params.inputProps,
            "aria-label": jugador ? `Personaje de ${jugador}` : "Personaje",
          }}
        />
      )}
    />
  );
};

export const PersonajeControl = withJsonFormsControlProps(PersonajeControlBase);

/**
 * Se aplica a los controles de texto con `options.personaje: true`. El rango
 * tiene que ganar al renderer de texto de material-renderers (rango 1).
 */
export const personajeControlTester: RankedTester = rankWith(
  10,
  and(isStringControl, optionIs("personaje", true))
);
