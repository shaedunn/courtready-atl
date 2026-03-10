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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      court_logs: {
        Row: {
          author: string
          court_id: string
          created_at: string
          id: string
          message: string
        }
        Insert: {
          author?: string
          court_id: string
          created_at?: string
          id?: string
          message: string
        }
        Update: {
          author?: string
          court_id?: string
          created_at?: string
          id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_logs_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      court_status: {
        Row: {
          action_label: string | null
          captain_note: string | null
          court_id: string
          created_at: string
          created_by: string | null
          effort_tags: string[] | null
          id: string
          status: string
        }
        Insert: {
          action_label?: string | null
          captain_note?: string | null
          court_id: string
          created_at?: string
          created_by?: string | null
          effort_tags?: string[] | null
          id?: string
          status: string
        }
        Update: {
          action_label?: string | null
          captain_note?: string | null
          court_id?: string
          created_at?: string
          created_by?: string | null
          effort_tags?: string[] | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_status_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          court_count: number
          created_at: string
          debris_factor: string | null
          dna_note: string | null
          drainage: number
          drainage_profile: string | null
          id: string
          latitude: number | null
          location: string
          longitude: number | null
          name: string
          slug: string
          sun_exposure: number
          surface: string
        }
        Insert: {
          court_count?: number
          created_at?: string
          debris_factor?: string | null
          dna_note?: string | null
          drainage?: number
          drainage_profile?: string | null
          id?: string
          latitude?: number | null
          location: string
          longitude?: number | null
          name: string
          slug: string
          sun_exposure?: number
          surface?: string
        }
        Update: {
          court_count?: number
          created_at?: string
          debris_factor?: string | null
          dna_note?: string | null
          drainage?: number
          drainage_profile?: string | null
          id?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          name?: string
          slug?: string
          sun_exposure?: number
          surface?: string
        }
        Relationships: []
      }
      facility_requests: {
        Row: {
          address: string
          created_at: string
          facility_name: string
          id: string
          requester_email: string | null
          status: string
        }
        Insert: {
          address: string
          created_at?: string
          facility_name: string
          id?: string
          requester_email?: string | null
          status?: string
        }
        Update: {
          address?: string
          created_at?: string
          facility_name?: string
          id?: string
          requester_email?: string | null
          status?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          away_team: string
          court_id: string
          created_at: string
          home_team: string
          id: string
          match_time: string
          share_slug: string
        }
        Insert: {
          away_team: string
          court_id: string
          created_at?: string
          home_team: string
          id?: string
          match_time: string
          share_slug: string
        }
        Update: {
          away_team?: string
          court_id?: string
          created_at?: string
          home_team?: string
          id?: string
          match_time?: string
          share_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      observations: {
        Row: {
          court_id: string
          created_at: string
          display_name: string
          id: string
          report_id: string | null
          status: string
        }
        Insert: {
          court_id: string
          created_at?: string
          display_name?: string
          id?: string
          report_id?: string | null
          status: string
        }
        Update: {
          court_id?: string
          created_at?: string
          display_name?: string
          id?: string
          report_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "observations_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          abstract_observations: string | null
          court_id: string
          created_at: string
          drainage: number | null
          estimated_dry_minutes: number
          hindrances: string[]
          humidity: number | null
          id: string
          photo_url: string | null
          rainfall: number
          sky_condition: string
          squeegee_count: number
          sun_exposure: number | null
          temperature: number | null
          wind_speed: number | null
        }
        Insert: {
          abstract_observations?: string | null
          court_id: string
          created_at?: string
          drainage?: number | null
          estimated_dry_minutes: number
          hindrances?: string[]
          humidity?: number | null
          id?: string
          photo_url?: string | null
          rainfall: number
          sky_condition: string
          squeegee_count?: number
          sun_exposure?: number | null
          temperature?: number | null
          wind_speed?: number | null
        }
        Update: {
          abstract_observations?: string | null
          court_id?: string
          created_at?: string
          drainage?: number | null
          estimated_dry_minutes?: number
          hindrances?: string[]
          humidity?: number | null
          id?: string
          photo_url?: string | null
          rainfall?: number
          sky_condition?: string
          squeegee_count?: number
          sun_exposure?: number | null
          temperature?: number | null
          wind_speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_courts: {
        Row: {
          court_number: number
          created_at: string
          drainage: number
          facility_id: string
          hazard_description: string | null
          id: string
          permanent_note: string | null
          sun_exposure: number
          surface_type: string
        }
        Insert: {
          court_number: number
          created_at?: string
          drainage?: number
          facility_id: string
          hazard_description?: string | null
          id?: string
          permanent_note?: string | null
          sun_exposure?: number
          surface_type?: string
        }
        Update: {
          court_number?: number
          created_at?: string
          drainage?: number
          facility_id?: string
          hazard_description?: string | null
          id?: string
          permanent_note?: string | null
          sun_exposure?: number
          surface_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_courts_court_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_cache: {
        Row: {
          cache_key: string
          description: string | null
          humidity: number | null
          icon: string | null
          id: string
          last_requested_at: string
          lat: number
          lon: number
          rain_1h: number | null
          raw_payload: Json
          temp: number | null
          updated_at: string
          wind_speed: number | null
        }
        Insert: {
          cache_key: string
          description?: string | null
          humidity?: number | null
          icon?: string | null
          id?: string
          last_requested_at?: string
          lat: number
          lon: number
          rain_1h?: number | null
          raw_payload?: Json
          temp?: number | null
          updated_at?: string
          wind_speed?: number | null
        }
        Update: {
          cache_key?: string
          description?: string | null
          humidity?: number | null
          icon?: string | null
          id?: string
          last_requested_at?: string
          lat?: number
          lon?: number
          rain_1h?: number | null
          raw_payload?: Json
          temp?: number | null
          updated_at?: string
          wind_speed?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
