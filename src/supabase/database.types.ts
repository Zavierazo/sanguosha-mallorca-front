export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      jugadores: {
        Row: {
          email: string | null
          id: number
          nombre: string
        }
        Insert: {
          email?: string | null
          id?: number
          nombre: string
        }
        Update: {
          email?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      losing_penalty: {
        Row: {
          players: number
          points_lost: number
          points_lost_2024: number | null
          team: string
        }
        Insert: {
          players: number
          points_lost: number
          points_lost_2024?: number | null
          team: string
        }
        Update: {
          players?: number
          points_lost?: number
          points_lost_2024?: number | null
          team?: string
        }
        Relationships: []
      }
      medals: {
        Row: {
          division: string
          medal: string
          min_elo: number
        }
        Insert: {
          division: string
          medal: string
          min_elo: number
        }
        Update: {
          division?: string
          medal?: string
          min_elo?: number
        }
        Relationships: []
      }
      niveles: {
        Row: {
          exp: number
          exp_acumulada: number
          nivel: number
          rango: string | null
        }
        Insert: {
          exp: number
          exp_acumulada: number
          nivel: number
          rango?: string | null
        }
        Update: {
          exp?: number
          exp_acumulada?: number
          nivel?: number
          rango?: string | null
        }
        Relationships: []
      }
      partidas: {
        Row: {
          creation_user: string | null
          fecha: string | null
          is_ranked: boolean | null
          nivel: number | null
          num_partida: number
          torneo_id: number
        }
        Insert: {
          creation_user?: string | null
          fecha?: string | null
          is_ranked?: boolean | null
          nivel?: number | null
          num_partida: number
          torneo_id: number
        }
        Update: {
          creation_user?: string | null
          fecha?: string | null
          is_ranked?: boolean | null
          nivel?: number | null
          num_partida?: number
          torneo_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_partidas_creation_user"
            columns: ["creation_user"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "fk_partidas_creation_user"
            columns: ["creation_user"]
            isOneToOne: false
            referencedRelation: "v_jugadores"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "fk_partidas_torneo"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "torneo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_partidas_torneo"
            columns: ["torneo_id"]
            isOneToOne: false
            referencedRelation: "v_torneos_resumen"
            referencedColumns: ["torneo_id"]
          },
        ]
      }
      personajes: {
        Row: {
          id: number
          nivel: number
          nombre: string
        }
        Insert: {
          id?: number
          nivel: number
          nombre: string
        }
        Update: {
          id?: number
          nivel?: number
          nombre?: string
        }
        Relationships: []
      }
      puntuaciones: {
        Row: {
          ganada: boolean | null
          id: number
          jugador: string | null
          kills: number | null
          num_partida: number
          personaje: string | null
          puntos: number | null
          rol: string
          torneo_id: number
        }
        Insert: {
          ganada?: boolean | null
          id?: number
          jugador?: string | null
          kills?: number | null
          num_partida: number
          personaje?: string | null
          puntos?: number | null
          rol: string
          torneo_id: number
        }
        Update: {
          ganada?: boolean | null
          id?: number
          jugador?: string | null
          kills?: number | null
          num_partida?: number
          personaje?: string | null
          puntos?: number | null
          rol?: string
          torneo_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["jugador"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["jugador"]
            isOneToOne: false
            referencedRelation: "v_jugadores"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "fk_puntuaciones_partidas"
            columns: ["torneo_id", "num_partida"]
            isOneToOne: false
            referencedRelation: "partidas"
            referencedColumns: ["torneo_id", "num_partida"]
          },
        ]
      }
      role_distributions: {
        Row: {
          espia: number
          leal: number
          num_jugadores: number
          rebelde: number
          rey: number
        }
        Insert: {
          espia: number
          leal: number
          num_jugadores: number
          rebelde: number
          rey: number
        }
        Update: {
          espia?: number
          leal?: number
          num_jugadores?: number
          rebelde?: number
          rey?: number
        }
        Relationships: []
      }
      torneo: {
        Row: {
          descripcion: string | null
          fecha: string | null
          id: number
          num_jugadores: number | null
          scoring_system: string | null
        }
        Insert: {
          descripcion?: string | null
          fecha?: string | null
          id?: number
          num_jugadores?: number | null
          scoring_system?: string | null
        }
        Update: {
          descripcion?: string | null
          fecha?: string | null
          id?: number
          num_jugadores?: number | null
          scoring_system?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_games: {
        Row: {
          descripcion: string | null
          fecha: string | null
          ganada: boolean | null
          id: number | null
          is_ranked: boolean | null
          jugador: string | null
          nivel: number | null
          num_jugadores: number | null
          num_partida: number | null
          puntos: number | null
          rol: string | null
          scoring_system: string | null
          torneo_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["jugador"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["jugador"]
            isOneToOne: false
            referencedRelation: "v_jugadores"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "fk_puntuaciones_partidas"
            columns: ["torneo_id", "num_partida"]
            isOneToOne: false
            referencedRelation: "partidas"
            referencedColumns: ["torneo_id", "num_partida"]
          },
        ]
      }
      v_ganador_por_mesa: {
        Row: {
          gana_espia: number | null
          gana_rebeldes: number | null
          gana_rey: number | null
          num_jugadores: number | null
          partidas: number | null
          sin_ganador: number | null
        }
        Relationships: []
      }
      v_jugadores: {
        Row: {
          id: number | null
          nombre: string | null
        }
        Insert: {
          id?: number | null
          nombre?: string | null
        }
        Update: {
          id?: number | null
          nombre?: string | null
        }
        Relationships: []
      }
      v_jugadores_actividad: {
        Row: {
          jugador: string | null
          ultima_partida: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["jugador"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["jugador"]
            isOneToOne: false
            referencedRelation: "v_jugadores"
            referencedColumns: ["nombre"]
          },
        ]
      }
      v_niveles_por_jugador: {
        Row: {
          exp_necesaria: number | null
          exp_nivel_actual: number | null
          jugador: string | null
          max_nivel_jugado: number | null
          nivel_desbloqueado: number | null
          rango: string | null
          ultima_partida: string | null
        }
        Relationships: []
      }
      v_partidas_por_anyo: {
        Row: {
          anyo: number | null
          jugador: string | null
          partidas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["jugador"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["jugador"]
            isOneToOne: false
            referencedRelation: "v_jugadores"
            referencedColumns: ["nombre"]
          },
        ]
      }
      v_temporadas: {
        Row: {
          jugadores: number | null
          partidas: number | null
          temporada: number | null
        }
        Relationships: []
      }
      v_top_partidas_por_anyo: {
        Row: {
          anyo: number | null
          jugador: string | null
          partidas: number | null
          pos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["jugador"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["jugador"]
            isOneToOne: false
            referencedRelation: "v_jugadores"
            referencedColumns: ["nombre"]
          },
        ]
      }
      v_torneos_completos: {
        Row: {
          descripcion: string | null
          fecha: string | null
          ganador: string | null
          jugadores: number | null
          torneo_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["ganador"]
            isOneToOne: false
            referencedRelation: "jugadores"
            referencedColumns: ["nombre"]
          },
          {
            foreignKeyName: "fk_puntuaciones_jugador"
            columns: ["ganador"]
            isOneToOne: false
            referencedRelation: "v_jugadores"
            referencedColumns: ["nombre"]
          },
        ]
      }
      v_torneos_resumen: {
        Row: {
          descripcion: string | null
          fecha: string | null
          is_completed: boolean | null
          jugadores_orden_original: string[] | null
          max_num_partida: number | null
          num_jugadores: number | null
          scoring_system: string | null
          torneo_id: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      crear_torneo: {
        Args: { p_crear_jugadores?: boolean; p_payload: Json }
        Returns: Json
      }
      fn_espia: {
        Args: { p_meses?: number }
        Returns: {
          activo: boolean
          espia: number
          espia_ganadas: number
          gana_espia: number
          gana_rebeldes: number
          gana_rey: number
          jugador: string
          num_jugadores: number
          partidas: number
          prob_esperada_sum: number
          sin_ganador: number
          ultima_partida: string
        }[]
      }
      fn_estadisticas: {
        Args: {
          p_desde?: string
          p_elo_inicial?: number
          p_hasta?: string
          p_multiplicador_elo_2020?: number
          p_multiplicador_elo_2024?: number
          p_partidas_minimas?: number
          p_penalizacion_mensual?: number
          p_porcentaje_participacion?: number
        }
        Returns: {
          antisinergia: string
          archienemigo: string
          division: string
          elo_ajustado: number
          espia: number
          jugador: string
          leal: number
          partidas: number
          pct_wins: number
          ponderado: number
          pos: number
          rango: string
          rebelde: number
          rey: number
          sinergia: string
        }[]
      }
      fn_iniciaciones: {
        Args: never
        Returns: {
          debut_fecha: string
          debut_torneo_id: number
          iniciaciones: number
          iniciados: number
          jugador: string
          pos: number
        }[]
      }
      fn_iniciaciones_detalle: {
        Args: { p_jugador: string }
        Returns: {
          debutante: string
          descripcion: string
          fecha: string
          torneo_id: number
        }[]
      }
      fn_nivel_jugadores: {
        Args: { p_meses?: number; p_nivel_maximo?: number }
        Returns: {
          completo: boolean
          exp: number
          exp_necesaria: number
          jugador: string
          nivel: number
          porcentaje: number
          rango: string
          ultima_partida: string
        }[]
      }
      fn_niveles_por_jugador: {
        Args: {
          p_bono_victoria?: number
          p_incremento_xp?: number
          p_xp_base?: number
        }
        Returns: {
          exp_necesaria: number
          exp_nivel_actual: number
          jugador: string
          max_nivel_jugado: number
          nivel_desbloqueado: number
          rango: string
          ultima_partida: string
        }[]
      }
      fn_partidas_por_rol: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: {
          espia: number
          jugador: string
          leal: number
          rebelde: number
          rey: number
          total: number
        }[]
      }
      fn_torneos: {
        Args: {
          p_desde?: string
          p_elo_inicial?: number
          p_elo_por_ganar?: number
          p_elo_por_perder?: number
          p_hasta?: string
        }
        Returns: {
          elo: number
          ganados: number
          jugador: string
          participados: number
          pct_wins: number
          podio: number
          ponderado: number
          pos: number
        }[]
      }
      soy_organizador: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
