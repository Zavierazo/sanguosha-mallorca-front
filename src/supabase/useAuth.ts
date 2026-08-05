import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./client";

export interface AuthState {
  /** Configurado el proyecto de Supabase en este despliegue. */
  configured: boolean;
  /** Ya sabemos si hay sesión o no. Antes de esto no hay que pintar botones. */
  ready: boolean;
  session: Session | null;
  email: string | null;
  /**
   * Puede el usuario insertar. null = todavía no se sabe.
   *
   * Estar identificado con Google no basta: cualquiera puede crearse una cuenta.
   * La respuesta la da la base de datos con soy_organizador(), que comprueba que
   * el correo esté en jugadores.email. Aquí sólo sirve para mostrar u ocultar
   * controles; la decisión de verdad la toman las políticas de RLS y la propia
   * crear_torneo(), así que trucar esto en el navegador no da acceso a nada.
   */
  isOrganiser: boolean | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [ready, setReady] = useState<boolean>(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [isOrganiser, setIsOrganiser] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sesión inicial más suscripción a los cambios. onAuthStateChange también
  // dispara cuando supabase-js termina de canjear el ?code= de la vuelta de
  // Google, así que cubre el arranque tras el login.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = getSupabase();
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session ?? null);
        setReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setReady(true);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession ?? null);
        setReady(true);
      }
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Preguntar a la base de datos si este correo puede insertar.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    if (!session) {
      setIsOrganiser(null);
      return;
    }

    let cancelled = false;
    setIsOrganiser(null);

    getSupabase()
      .rpc("soy_organizador")
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) {
          setError(rpcError.message);
          setIsOrganiser(false);
          return;
        }
        setIsOrganiser(Boolean(data));
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      // Volver a la misma página en la que estaba. Esta URL tiene que estar en
      // Authentication > URL Configuration > Redirect URLs del proyecto.
      const redirectTo = `${window.location.origin}${window.location.pathname}`;

      const { error: oauthError } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (oauthError) setError(oauthError.message);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      const { error: signOutError } = await getSupabase().auth.signOut();
      if (signOutError) setError(signOutError.message);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return {
    configured: isSupabaseConfigured,
    ready,
    session,
    email: session?.user?.email ?? null,
    isOrganiser,
    error,
    signInWithGoogle,
    signOut,
  };
}
