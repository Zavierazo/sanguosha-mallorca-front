---
inclusion: auto
name: Audit de dependencias (web)
description: Cómo auditar y actualizar las dependencias npm del repo sanguosha-mallorca-front. Usar cuando se pida un npm audit, revisar vulnerabilidades, actualizar o subir versiones de paquetes, quitar dependencias sin usar, tocar package.json, package-lock.json u overrides, resolver avisos de deprecación o de peer dependencies, o evaluar un salto de versión mayor (MUI, TypeScript, ESLint, Vite, React).
---

# Audit de dependencias del repo web

Lo aprendido en el audit de septiembre de 2026. Actualizar cuando cambie algo.

## Estado de referencia

Si el audit no sale así, algo ha cambiado y hay que averiguar qué:

- **0 vulnerabilidades**, también con `--omit=dev`.
- **`npm install` dice "audited 464 packages".** Ése es el número de paquetes
  instalados en esta plataforma.
- **El lockfile tiene 568 entradas** (567 paquetes más la del propio proyecto),
  más que las instaladas, porque registra los binarios de Linux y macOS que aquí
  no se bajan. `npm audit --json` informa de ese conjunto: 130 de producción, 438
  de desarrollo, 151 opcionales y 38 peers. **Que las cifras no cuadren entre sí
  no es un error**; saber cuál mira cada comando evita media hora de confusión.
- `npm outdated` sólo debería listar majors, con `Current` = `Wanted` en todos.
  Cualquier fila donde `Current` ≠ `Wanted` es una actualización pendiente que
  cabe dentro de los rangos ya declarados.
- Node local 22.14, **Node del CI 24** (`.github/workflows/build.yml`).

## El orden que funciona

```powershell
npm audit                    # que hay
npm outdated                 # que se puede subir sin tocar package.json
npm audit fix                # cierra avisos sin cambiar rangos
npm update                   # sube al maximo de cada rango ^
npm install                  # deja el lockfile coherente
```

Después, **las cuatro comprobaciones, en este orden**, y ninguna es opcional:

```powershell
npm test        # 42 tests, deben pasar todos
npm run lint    # exit 0
npm run build   # vite build
& node ".\node_modules\typescript\bin\tsc" --noEmit
```

**`npm run build` pasando no prueba nada sobre los tipos.** Vite usa rolldown,
que transpila sin comprobar. Un `Cannot find name 'X'` compila igual y explota en
el navegador al pintar ese componente. Comprobado: con 18 errores de `tsc` el
build salía en verde. `tsc --noEmit` es la única red de tipos.

**Toma la línea base antes de tocar nada.** Este repo se trabaja con cambios sin
commitear encima, y si `tsc` o `lint` ya fallaban conviene saberlo para no
atribuirle esos errores a la actualización.

## Los majors están bloqueados, y no por capricho

Comprobado con `npm view <paquete> peerDependencies`:

| Salto | Bloqueado por |
|---|---|
| `@mui/material` y `@mui/icons-material` 7 → 9 | `@jsonforms/material-renderers` 3.8.0 pide `@mui/material ^7.0.0` |
| `@mui/x-date-pickers` 8 → 9 | lo mismo: jsonforms pide `^8.0.0` |
| `typescript` 5.9 → 7 | `typescript-eslint` 8.x pide `typescript >=4.8.4 <6.1.0` |
| `@types/node` → 25 o 26 | debe casar con el Node del CI, que es 24. Fijado a `^24` |

Sobre MUI hay un detalle que cambia la decisión: **no hay ni un `import` de
`@mui/*` en `src`**. MUI, `@emotion/react`, `@emotion/styled` y `dayjs` están en
`dependencies` sólo para satisfacer los peers de `@jsonforms/material-renderers`,
que se usa en `RankingModal.tsx`. Subir a MUI 9 no cambiaría nada visible y
rompería el peer. No parecen dependencias sin usar: no las quites.

TypeScript 7 es el compilador portado a Go. Misma semántica de tipos, builds
mucho más rápidas, pero el ecosistema de linting aún no lo admite y el camino
recomendado pasa por la 6.0 como puente. No es un bump rutinario.

## Overrides: aquí ya nos ha mordido

`package.json` **no tiene ningún override**, y eso es deliberado. Había tres,
metidos juntos en el commit `8cd2411`, cuyo mensaje habla de otra cosa y no los
menciona:

```json
"overrides": {
  "glob": "^13.0.0",
  "whatwg-encoding": "npm:@exodus/bytes",
  "inflight": "npm:lru-cache"
}
```

Los tres existían para **silenciar avisos de deprecación de `npm install`**, no
para cerrar vulnerabilidades. Y el de `whatwg-encoding` tenía un coste que nadie
vio: `@exodus/bytes` **lanza una excepción al importarlo** porque no tiene export
único, hay que importar submódulos. jsdom importa `whatwg-encoding`, así que
cualquier test con jsdom moría antes de empezar. Con el paquete real,
`whatwg-encoding@3.1.1`, `npm audit` da **0 vulnerabilidades**: el override
cambiaba un aviso cosmético por un runner de tests roto.

Reglas que salen de ahí:

- **Un aviso de deprecación no es una vulnerabilidad.** `npm warn deprecated` sale
  en `npm install` y es informativo. Lo que cuenta es `npm audit`. No pongas un
  override para callar un `npm warn`.
- **Los alias `npm:otro-paquete` cambian el paquete, no la versión.** No son
  drop-in aunque el aviso de deprecación diga "usa X en su lugar". Si pones uno,
  ejecuta lo que dependa de él antes de darlo por bueno.
- **Un override sin comentario es deuda.** Si hace falta uno, explica en el mismo
  commit qué avería concreta arregla y qué comprobación demuestra que sigue
  siendo necesario.
- Antes de heredar un override, comprueba si sigue aplicando:
  `npm ls <paquete>`. `inflight` ya no estaba en el árbol y el override llevaba
  meses siendo letra muerta.

## Qué llega de verdad al navegador

Las 4 vulnerabilidades del audit de septiembre (2 high, 2 moderate) estaban todas
en cadenas de build o despliegue: `undici` vía `wrangler` → `miniflare`, y
`nanoid` vía `@tailwindcss/postcss` → `postcss`. Ninguna se empaquetaba.

Para separar una cosa de otra:

```powershell
npm audit --omit=dev     # solo lo que puede acabar en el bundle
npm ls <paquete>         # por donde entra
```

Un hallazgo en `dependencies` tampoco significa que viaje al navegador: lo que
cuenta es si algo de `src` lo importa. `@tailwindcss/postcss` está en
`devDependencies` y es de build; `wrangler` sólo corre al desplegar.

## El lockfile y el CI

El CI corre en `ubuntu-latest` con `npm install`. Al refrescar el lockfile en
Windows, **comprueba que no se han perdido las entradas de otras plataformas**:

```powershell
node -e "const l=require('./package-lock.json'); const n=Object.keys(l.packages); console.log('total='+n.length+' linux='+n.filter(x=>/linux/.test(x)).length+' darwin='+n.filter(x=>/darwin/.test(x)).length);"
```

Debe haber decenas de entradas `linux` y `darwin` (binarios de esbuild,
lightningcss, rolldown, oxide...). Si se van a cero, el CI dejará de ser
reproducible.

**`npm ls` marca 6 paquetes como `extraneous`** (`@emnapi/*`,
`@img/sharp-wasm32`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`). Son binarios
wasm opcionales de `sharp`, que llega por `wrangler`, marcados `dev` y `optional`
en el lockfile y no alcanzables en win32 porque aquí se usa el binding nativo.
`npm ls` sale con código 0. Es ruido conocido: no lo persigas.

## Dependencias que parecen sin usar y no lo están

Antes de quitar algo, comprueba quién lo importa de verdad:

```powershell
Get-ChildItem -Recurse -Path src -Include *.ts,*.tsx | Select-String -Pattern "from ['""]([^.'""][^'""]*)['""]" -AllMatches | ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
```

Eso lista los imports externos reales. Cero importaciones **no** basta para
borrar: hay que descartar que sea un peer de otra cosa (`npm ls <paquete>`), un
plugin cargado por configuración (`tailwindcss`, `eslint-plugin-react`) o un tipo.

En el audit de septiembre se quitaron cuatro de producción, todas comprobadas:
`@react-oauth/google` (el login va por `supabase-js` con PKCE),
`react-code-blocks` y `styled-components` (los sustituyó un `<pre>` en
`RawData.tsx`) y `prop-types`.

**`prop-types` merece una nota**: React 19 dejó de leer `propTypes` y
`defaultProps` en componentes función. Eran objetos que nadie mira. Al quitarlos
hay que confirmar que los `defaultProps` no estaban tapando un prop que falta;
aquí no, porque el tipo los declaraba obligatorios y el único sitio que montaba
el componente los pasaba siempre. El paquete sigue en el árbol como dependencia
transitiva de MUI, `react-modal`, `react-select` y `eslint-plugin-react`, así que
el recuento no baja: lo que se gana es que nuestro código ya no lo usa.

## Los tests son parte del audit

Hay **42 tests** en `src/supabase/crearTorneo.test.ts` y
`src/Ranking/formatoRawData.test.ts`, todos de lógica pura. Son la primera red al
subir versiones: cubren el emparejado nombre-puntuación (de donde salen las filas
que se guardan en `puntuaciones`) y el ciclo completo del texto de Raw Data.

Se comprobó que muerden, rompiendo el código a mano: reintroducir el fallo del
`filter` antes del `map` hace caer un test, y quitar el marcador `muere` del
formato hace caer dos. Un tercer sabotaje, quitar la comprobación contra
`CAMPOS_CABECERA`, **no** rompió ninguno: esa lista cerrada es defensa preventiva
y no tiene efecto observable con entradas realistas. Conviene saberlo para no
confiar en una cobertura que ahí no existe.

**El runner es vitest, no jest, y hay un motivo técnico.** `src/supabase/client.ts`
usa `import.meta.env`, que es sintaxis de Vite; jest corre en CommonJS y no la
entiende, y `crearTorneo.ts` importa ese módulo. Vitest usa la misma
transformación que el build, así que lo que se prueba se compila igual que lo que
se despliega. El aparato de jest que había (heredado de create-react-app) nunca
llegó a funcionar: además del override que rompía jsdom, no había ningún
transform configurado, así que ni `setupTests.ts` se podía cargar.

`vitest.config.ts` va **separado** de `vite.config.ts`: cuando existe, vitest no
carga el de vite, y así los tests no arrastran el plugin de react ni la
configuración de `build`. Está en `environment: node` porque no hay tests de
componentes. Para escribir el primero hay que instalar `jsdom` y
`@testing-library/react`, que se quitaron al no usarse.

## Trampas de PowerShell, ya pagadas dos veces

- **No redirijas a fichero con `>` ni `Out-File`.** Escriben UTF-16 y el BOM hace
  que `JSON.parse` falle con `Unexpected token '<�>'`. Para capturar
  `npm audit --json`:
  ```powershell
  $j = (npm audit --json 2>$null) -join "`n"
  [System.IO.File]::WriteAllText("$env:TEMP\audit.json", $j, [System.Text.UTF8Encoding]::new($false))
  ```
- **`npm run <script>` y `npx` recortan la salida** en esta consola: los errores
  de `tsc` se pierden a mitad. Ejecuta el binario directamente:
  `& node ".\node_modules\typescript\bin\tsc" --noEmit`, o
  `& node ".\node_modules\vite\bin\vite.js" build`. Y captura en una variable
  (`$out = ... | Out-String`) antes de filtrar, que si no se trocea.
- **`if` no es una expresión** en PowerShell: `"$( if (...) {...} )"` inline falla.
  Asigna a una variable antes.
- `npm audit` y `npm outdated` **salen con código distinto de 0** cuando
  encuentran algo. No lo interpretes como que el comando ha fallado.
- Al ejecutar `npm update` con un build corriendo, npm deja carpetas
  `.binding-*` sin borrar en `node_modules\@rolldown\` por un `EPERM`. Es
  inocuo y va en `.gitignore`.

## Cosas que no hay que "arreglar"

- **El aviso ESM/CJS de Vite.** `vite.config.ts` y `vitest.config.ts` sacan
  "ESM syntax in a file loaded as CommonJS ... set `"type": "module"`". Es
  preexistente y no rompe nada. Añadir `"type": "module"` a `package.json`
  parecería la solución, pero `postcss.config.js` y `tailwind.config.js` son
  CommonJS y se romperían. Si algún día se hace, hay que renombrarlos a `.cjs`
  en el mismo cambio.
- **El aviso de chunk de más de 500 kB.** El bundle son ~1,5 MB (441 kB con
  gzip). Es una decisión pendiente sobre code splitting, no un fallo del audit.
- **El `.env` commiteado.** Sólo contiene `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_PUBLISHABLE_KEY`, y Vite mete en el bundle todo lo que empieza
  por `VITE_`: son públicas por diseño y no hay nada que rotar. Lo que sí
  conviene recordar es que ese repo **no tiene `.env` en `.gitignore`**, así que
  el día que se añada un secreto ahí se publicará.

## Al terminar

Deja dicho, con números, qué cambió y qué no se pudo verificar. En concreto: no
hay tests de integración contra Supabase, así que un salto de `supabase-js`
compila y pasa los 42 tests sin demostrar que la web siga leyendo y escribiendo.
Antes de desplegar, abrir `/ranking` y `/estadisticas` a mano.
