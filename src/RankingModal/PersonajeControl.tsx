import React, { useMemo } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import {
  and,
  isStringControl,
  optionIs,
  rankWith,
  type ControlProps,
  type RankedTester,
} from "@jsonforms/core";
import { withJsonFormsControlProps } from "@jsonforms/react";
import type { Personaje } from "../data";
import {
  GRUPO_OTROS,
  grupoDelNivel,
  sugerenciasPersonaje,
  type OpcionPersonaje,
} from "../Ranking/personajes";

/**
 * Lo que el modal pasa en el `config` de JsonForms para este control.
 *
 * Va por `config` y no cerrando el renderer sobre las props del modal porque un
 * renderer nuevo en cada render obligaría a JsonForms a desmontar y volver a
 * montar el campo, y el Autocomplete perdería el foco a mitad de escribir.
 */
export interface ConfigPersonaje {
  /** null: el catálogo no ha cargado (o falló). El campo se deshabilita. */
  personajes: Personaje[] | null;
  /** El nivel del desplegable de la partida. */
  nivel: number;
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
  const { personajes, nivel } = (config ?? {}) as Partial<ConfigPersonaje>;
  const jugador = (uischema.options?.jugador as string | undefined) ?? "";
  const valor = typeof data === "string" && data.trim() ? data.trim() : null;

  const opciones = useMemo<OpcionPersonaje[]>(() => {
    const base = sugerenciasPersonaje(personajes ?? [], nivel ?? 0);
    // Un valor que ya no está en el catálogo (se recargó después de apuntarlo)
    // se enseña igual, para que se vea y se pueda cambiar. Al guardar lo
    // rechazaría crear_torneo().
    if (valor && !base.some((o) => o.nombre.toLowerCase() === valor.toLowerCase())) {
      return [...base, { nombre: valor, niveles: [], delNivel: false }];
    }
    return base;
  }, [personajes, nivel, valor]);

  const seleccionada =
    valor === null
      ? null
      : opciones.find((o) => o.nombre.toLowerCase() === valor.toLowerCase()) ?? null;

  const sinCatalogo = personajes == null;
  const fueraDeCatalogo = seleccionada !== null && seleccionada.niveles.length === 0;

  const ayuda = sinCatalogo
    ? "Lista de personajes no disponible"
    : fueraDeCatalogo
      ? "No está en el catálogo: cámbialo o déjalo en blanco"
      : undefined;

  return (
    <Autocomplete<OpcionPersonaje, false, false, false>
      options={opciones}
      value={seleccionada}
      onChange={(_, opcion) => handleChange(path, opcion?.nombre ?? undefined)}
      groupBy={(o) => (o.delNivel ? grupoDelNivel(nivel ?? 0) : GRUPO_OTROS)}
      getOptionLabel={(o) => o.nombre}
      isOptionEqualToValue={(a, b) => a.nombre.toLowerCase() === b.nombre.toLowerCase()}
      renderOption={(props, o) => {
        // `key` va aparte: MUI lo mete en props y React avisa si se esparce.
        const { key, ...resto } = props as typeof props & { key: React.Key };
        return (
          <li key={key} {...resto}>
            <span>{o.nombre}</span>
            {o.niveles.length > 0 && (
              <span className="ml-2 text-xs text-gray-500">
                · {o.niveles.map((n) => Number(n)).join(", ")}
              </span>
            )}
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
