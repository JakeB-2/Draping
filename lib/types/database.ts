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
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          time_requirement_minutes: number
          service_group_id: string
          is_active?: boolean
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          time_requirement_minutes?: number
          service_group_id?: string
          is_active?: boolean
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
          people_count: number
          is_active: boolean
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          duration_minutes: number
          price_amount: number
          break_required?: boolean
          break_minutes?: number
          people_count?: number
          is_active?: boolean
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          duration_minutes?: number
          price_amount?: number
          break_required?: boolean
          break_minutes?: number
          people_count?: number
          is_active?: boolean
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
          slot_increment_minutes: number
          day_start_time: string
          day_end_time: string
          pair_extra_minutes: number
          max_booked_minutes_per_day: number | null
          max_booking_days_per_week: number | null
          max_consecutive_booking_days: number | null
        }
        Insert: {
          id?: string
          slot_increment_minutes?: number
          day_start_time?: string
          day_end_time?: string
          pair_extra_minutes?: number
          max_booked_minutes_per_day?: number | null
          max_booking_days_per_week?: number | null
          max_consecutive_booking_days?: number | null
        }
        Update: {
          slot_increment_minutes?: number
          day_start_time?: string
          day_end_time?: string
          pair_extra_minutes?: number
          max_booked_minutes_per_day?: number | null
          max_booking_days_per_week?: number | null
          max_consecutive_booking_days?: number | null
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
          price_amount: number
          duration_minutes: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          offering_id?: string | null
          starts_at: string
          ends_at: string
          status?: string
          booked_as_pair?: boolean
          includes_break?: boolean
          price_amount: number
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
          price_amount?: number
          duration_minutes?: number
          notes?: string | null
        }
      }
      booking_clients: {
        Row: { id: string; booking_id: string; client_id: string; client_role: string | null }
        Insert: { id?: string; booking_id: string; client_id: string; client_role?: string | null }
        Update: { id?: string; booking_id?: string; client_id?: string; client_role?: string | null }
      }
    }
  }
}
