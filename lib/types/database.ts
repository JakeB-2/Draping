export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Database = {
  public: {
    Tables: {
      service_groups: {
        Row: { id: string; name: string; description: string | null }
        Insert: { id?: string; name: string; description?: string | null }
        Update: { id?: string; name?: string; description?: string | null }
      }
      services: {
        Row: {
          id: string
          name: string
          description: string | null
          time_requirement_minutes: number
          service_group_id: string
          is_active: boolean
          price_amount: number
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          time_requirement_minutes: number
          service_group_id: string
          is_active?: boolean
          price_amount?: number
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          time_requirement_minutes?: number
          service_group_id?: string
          is_active?: boolean
          price_amount?: number
        }
      }
      service_duration_terms: {
        Row: {
          id: string
          service_id: string
          participant_count: number
          duration_minutes: number
        }
        Insert: {
          id?: string
          service_id: string
          participant_count: number
          duration_minutes: number
        }
        Update: {
          id?: string
          service_id?: string
          participant_count?: number
          duration_minutes?: number
        }
      }
      images: {
        Row: { id: string; storage_path: string; alt_text: string | null; created_at: string }
        Insert: { id?: string; storage_path: string; alt_text?: string | null; created_at?: string }
        Update: { id?: string; storage_path?: string; alt_text?: string | null }
      }
      service_images: {
        Row: { id: string; service_id: string; image_id: string; sort_order: number }
        Insert: { id?: string; service_id: string; image_id: string; sort_order?: number }
        Update: { id?: string; service_id?: string; image_id?: string; sort_order?: number }
      }
      offerings: {
        Row: {
          id: string
          name: string
          description: string | null
          duration_minutes: number
          price_amount: number
          break_required: boolean
          break_minutes: number
          buffer_minutes: number
          allowed_start_times: string[]
          people_count: number
          time_adjustment_minutes: number
          is_active: boolean
          price_override: number | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          duration_minutes: number
          price_amount: number
          break_required?: boolean
          break_minutes?: number
          buffer_minutes?: number
          allowed_start_times?: string[]
          people_count?: number
          time_adjustment_minutes?: number
          is_active?: boolean
          price_override?: number | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          duration_minutes?: number
          price_amount?: number
          break_required?: boolean
          break_minutes?: number
          buffer_minutes?: number
          allowed_start_times?: string[]
          people_count?: number
          time_adjustment_minutes?: number
          is_active?: boolean
          price_override?: number | null
        }
      }
      offering_images: {
        Row: { id: string; offering_id: string; image_id: string; sort_order: number }
        Insert: { id?: string; offering_id: string; image_id: string; sort_order?: number }
        Update: { id?: string; offering_id?: string; image_id?: string; sort_order?: number }
      }
      offering_services: {
        Row: { id: string; offering_id: string; service_id: string; sort_order: number | null }
        Insert: { id?: string; offering_id: string; service_id: string; sort_order?: number | null }
        Update: { id?: string; offering_id?: string; service_id?: string; sort_order?: number | null }
      }
      clients: {
        Row: {
          id: string
          first_name: string
          last_name: string
          email: string | null
          date_of_birth: string | null
          phone_number: string | null
          created_at: string
        }
        Insert: {
          id?: string
          first_name: string
          last_name: string
          email?: string | null
          date_of_birth?: string | null
          phone_number?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          first_name?: string
          last_name?: string
          email?: string | null
          date_of_birth?: string | null
          phone_number?: string | null
        }
      }
      booking_settings: {
        Row: {
          id: string
          day_start_time: string
          day_end_time: string
          pair_extra_minutes: number
          tax_rate_percent: number
          max_booked_minutes_per_day: number | null
          max_booking_days_per_week: number | null
          max_consecutive_booking_days: number | null
          max_participants_per_booking: number
          pair_discount_percent: number
        }
        Insert: {
          id?: string
          day_start_time?: string
          day_end_time?: string
          pair_extra_minutes?: number
          tax_rate_percent?: number
          max_booked_minutes_per_day?: number | null
          max_booking_days_per_week?: number | null
          max_consecutive_booking_days?: number | null
          max_participants_per_booking?: number
          pair_discount_percent?: number
        }
        Update: {
          day_start_time?: string
          day_end_time?: string
          pair_extra_minutes?: number
          tax_rate_percent?: number
          max_booked_minutes_per_day?: number | null
          max_booking_days_per_week?: number | null
          max_consecutive_booking_days?: number | null
          max_participants_per_booking?: number
          pair_discount_percent?: number
        }
      }
      weekly_schedule: {
        Row: {
          id: string
          weekday_number: number
          is_open: boolean
          start_time: string | null
          end_time: string | null
        }
        Insert: {
          id?: string
          weekday_number: number
          is_open?: boolean
          start_time?: string | null
          end_time?: string | null
        }
        Update: {
          is_open?: boolean
          start_time?: string | null
          end_time?: string | null
        }
      }
      blocked_periods: {
        Row: { id: string; start_at: string; end_at: string; reason: string | null }
        Insert: { id?: string; start_at: string; end_at: string; reason?: string | null }
        Update: { id?: string; start_at?: string; end_at?: string; reason?: string | null }
      }
      bookings: {
        Row: {
          id: string
          offering_id: string | null
          starts_at: string
          ends_at: string
          status: string
          booked_as_pair: boolean
          includes_break: boolean
          buffer_minutes: number
          price_amount: number
          subtotal_amount: number
          tax_rate_percent: number
          tax_amount: number
          total_amount: number
          duration_minutes: number
          notes: string | null
          is_waitlist: boolean
          created_at: string
          billing_client_id: string | null
          offering_name_snapshot: string | null
          base_package_amount: number | null
          occupied_until: string | null
        }
        Insert: {
          id?: string
          offering_id?: string | null
          starts_at: string
          ends_at: string
          status?: string
          booked_as_pair?: boolean
          includes_break?: boolean
          buffer_minutes?: number
          price_amount: number
          subtotal_amount: number
          tax_rate_percent?: number
          tax_amount?: number
          total_amount: number
          duration_minutes: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          offering_id?: string | null
          starts_at?: string
          ends_at?: string
          status?: string
          booked_as_pair?: boolean
          includes_break?: boolean
          buffer_minutes?: number
          price_amount?: number
          subtotal_amount?: number
          tax_rate_percent?: number
          tax_amount?: number
          total_amount?: number
          duration_minutes?: number
          notes?: string | null
        }
      }
      booking_clients: {
        Row: { id: string; booking_id: string; client_id: string; client_role: string | null }
        Insert: { id?: string; booking_id: string; client_id: string; client_role?: string | null }
        Update: { id?: string; booking_id?: string; client_id?: string; client_role?: string | null }
      }
      // The four tables below are written EXCLUSIVELY by the booking
      // engine database functions (booking_engine_create/revise) —
      // never insert/update them directly from app code.
      booking_participants: {
        Row: {
          id: string
          booking_id: string
          participant_number: number
          client_id: string | null
          display_name: string
          role: 'primary' | 'additional'
        }
        Insert: never
        Update: never
      }
      booking_segments: {
        Row: {
          id: string
          booking_id: string
          sort_order: number
          kind: 'service' | 'break'
          service_id: string | null
          service_name_snapshot: string | null
          duration_minutes: number
          seat_price_amount: number | null
          addon_amount: number
          label: string | null
        }
        Insert: never
        Update: never
      }
      booking_segment_participants: {
        Row: { id: string; segment_id: string; participant_id: string }
        Insert: never
        Update: never
      }
      booking_adjustments: {
        Row: {
          id: string
          booking_id: string
          kind: 'package' | 'pair_discount' | 'manual'
          label: string
          amount: number
          percent_snapshot: number | null
          created_at: string
        }
        Insert: never
        Update: never
      }
    }
    Functions: {
      booking_engine_quote: {
        Args: {
          p_offering_id: string
          p_participants: Json
          p_segments: Json
          p_manual_adjustments?: Json
        }
        Returns: Json
      }
      booking_engine_create: {
        Args: { p: Json }
        Returns: Json
      }
      booking_engine_revise: {
        Args: { p_booking_id: string; p: Json }
        Returns: Json
      }
    }
  }
}
