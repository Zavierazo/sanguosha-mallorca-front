import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type SanguoshaClient = SupabaseClient<Database>;

// Ambas variables van en el bundle del navegador (Vite expone todo lo que
// empieza por VITE_). Son publicas por diseno: la clave publishable no concede
// permisos por si misma, es el row level security del proyecto el que decide
// que se puede leer y escribir.
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * ¿Está Supabase configurado en este despliegue?
 *
 * La página tiene que seguir funcionando sin él: la lectura del ranking sale de
 * la hoja de Google, y el generador de puntuaciones sabe emitir el bloque de SQL
 * para pegar a mano. Sólo las partes que hablan con la base de datos se apagan.
 *
 * Por eso este módulo NO puede lanzar al importarse: un throw en el import
 * tumbaría toda la aplicación, incluidas las secciones que no usan Supabase.
 */
export const isSupabaseConfigured = Boolean(url && publishableKey);

let client: SanguoshaClient | null = null;

/**
 * Cliente de Supabase, creado la primera vez que se pide.
 *
 * Lanza si falta la configuración, así que hay que comprobar
 * `isSupabaseConfigured` antes de llamar, u ocultar el control que llevaría
 * aquí. El error es para el programador: si salta en producción es que el
 * despliegue no tiene las variables.
 */
export function getSupabase(): SanguoshaClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. ' +
        'Revisa el fichero .env.'
    );
  }

  // Una sola instancia por pestaña. Crear varios clientes con el mismo
  // storage key hace que compitan por refrescar el token de sesión.
  //
  // flowType 'pkce' porque el valor por defecto de auth-js es 'implicit', que
  // devuelve el access token en el fragmento de la URL: queda en el historial
  // del navegador y en cualquier cosa que registre URLs. Con PKCE vuelve un
  // código de un solo uso que se canjea contra Supabase. Los demás valores por
  // defecto ya son los que queremos (detectSessionInUrl, persistSession y
  // autoRefreshToken vienen a true), así que no se tocan.
  client ??= createClient<Database>(url, publishableKey, {
    auth: { flowType: 'pkce' },
  });
  return client;
}
