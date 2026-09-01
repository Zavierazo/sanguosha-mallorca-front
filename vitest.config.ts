import { defineConfig } from "vitest/config";

/**
 * Configuración de los tests.
 *
 * Va en un fichero aparte de `vite.config.ts` a propósito: cuando existe un
 * `vitest.config.ts`, vitest NO carga el de vite, así que los tests no arrastran
 * el plugin de react ni la configuración de `build`. Aquí sólo se prueba lógica
 * pura, que es lo que se puede probar sin montar componentes.
 *
 * Por qué vitest y no jest, que es lo que había configurado: el código usa
 * `import.meta.env` (en `src/supabase/client.ts`), que es sintaxis de Vite.
 * Jest corre en CommonJS y no la entiende, y `crearTorneo.ts` importa ese
 * módulo. Vitest usa la misma transformación que el build, así que lo que se
 * prueba se compila igual que lo que se despliega.
 */
export default defineConfig({
  test: {
    // No hay tests de componentes, así que no hace falta jsdom. Si algún día se
    // añaden, esto pasa a "jsdom" y hay que instalar `jsdom` y
    // `@testing-library/react`, que se quitaron al no usarse.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
