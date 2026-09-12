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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          entity: string
          entity_id: string | null
          id: number
          ip: string | null
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          entity: string
          entity_id?: string | null
          id?: never
          ip?: string | null
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          entity?: string
          entity_id?: string | null
          id?: never
          ip?: string | null
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      contact_attempts: {
        Row: {
          channel: string
          created_at: string
          created_by: string
          id: string
          next_follow_up_at: string | null
          note: string | null
          outcome: Database["public"]["Enums"]["contact_outcome"]
          person_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string
          id?: string
          next_follow_up_at?: string | null
          note?: string | null
          outcome: Database["public"]["Enums"]["contact_outcome"]
          person_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string
          id?: string
          next_follow_up_at?: string | null
          note?: string | null
          outcome?: Database["public"]["Enums"]["contact_outcome"]
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_attempts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_attempts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      delegations: {
        Row: {
          governorate_id: number
          id: number
          is_active: boolean
          name_ar: string
          name_fr: string | null
          sort_order: number
        }
        Insert: {
          governorate_id: number
          id?: never
          is_active?: boolean
          name_ar: string
          name_fr?: string | null
          sort_order?: number
        }
        Update: {
          governorate_id?: number
          id?: never
          is_active?: boolean
          name_ar?: string
          name_fr?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "delegations_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description_ar: string | null
          key: string
          label_ar: string
          phase: number
          sort_order: number
          state: Database["public"]["Enums"]["flag_state"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description_ar?: string | null
          key: string
          label_ar: string
          phase: number
          sort_order?: number
          state?: Database["public"]["Enums"]["flag_state"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description_ar?: string | null
          key?: string
          label_ar?: string
          phase?: number
          sort_order?: number
          state?: Database["public"]["Enums"]["flag_state"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      governorates: {
        Row: {
          id: number
          is_active: boolean
          name_ar: string
          name_fr: string
          sort_order: number
        }
        Insert: {
          id: number
          is_active?: boolean
          name_ar: string
          name_fr: string
          sort_order?: number
        }
        Update: {
          id?: number
          is_active?: boolean
          name_ar?: string
          name_fr?: string
          sort_order?: number
        }
        Relationships: []
      }
      interest_requests: {
        Row: {
          consent_text: string
          contact_channel: Database["public"]["Enums"]["contact_channel"]
          contact_time_label_ar: string | null
          contact_time_option_id: string | null
          created_at: string
          desired_area_label_ar: string | null
          desired_area_max_m2: number | null
          desired_area_min_m2: number | null
          desired_area_option_id: string | null
          down_payment_label_ar: string
          down_payment_max_millimes: number | null
          down_payment_min_millimes: number | null
          down_payment_option_id: string
          email: string | null
          full_name: string
          goal_code: string | null
          goal_label_ar: string
          goal_option_id: string
          id: string
          installment_label_ar: string
          installment_max_millimes: number | null
          installment_min_millimes: number | null
          installment_option_id: string
          invest_anywhere: boolean
          invest_governorate_ids: number[]
          is_duplicate: boolean
          person_id: string
          phone_e164: string
          plantation_systems: string[]
          priority_code: string | null
          priority_label_ar: string | null
          priority_option_id: string | null
          production_statuses: string[]
          project_type_ids: string[]
          project_type_unsure: boolean
          request_no: string
          residence_delegation_id: number | null
          residence_governorate_id: number
          scenario_ids: string[]
          scenario_labels: string[]
          source: Json
          tree_count_code: string | null
          tree_count_label_ar: string | null
          tree_count_max: number | null
          tree_count_min: number | null
          tree_count_option_id: string | null
          whatsapp_e164: string | null
        }
        Insert: {
          consent_text: string
          contact_channel: Database["public"]["Enums"]["contact_channel"]
          contact_time_label_ar?: string | null
          contact_time_option_id?: string | null
          created_at?: string
          desired_area_label_ar?: string | null
          desired_area_max_m2?: number | null
          desired_area_min_m2?: number | null
          desired_area_option_id?: string | null
          down_payment_label_ar: string
          down_payment_max_millimes?: number | null
          down_payment_min_millimes?: number | null
          down_payment_option_id: string
          email?: string | null
          full_name: string
          goal_code?: string | null
          goal_label_ar: string
          goal_option_id: string
          id?: string
          installment_label_ar: string
          installment_max_millimes?: number | null
          installment_min_millimes?: number | null
          installment_option_id: string
          invest_anywhere?: boolean
          invest_governorate_ids?: number[]
          is_duplicate?: boolean
          person_id: string
          phone_e164: string
          plantation_systems?: string[]
          priority_code?: string | null
          priority_label_ar?: string | null
          priority_option_id?: string | null
          production_statuses?: string[]
          project_type_ids?: string[]
          project_type_unsure?: boolean
          request_no: string
          residence_delegation_id?: number | null
          residence_governorate_id: number
          scenario_ids?: string[]
          scenario_labels?: string[]
          source?: Json
          tree_count_code?: string | null
          tree_count_label_ar?: string | null
          tree_count_max?: number | null
          tree_count_min?: number | null
          tree_count_option_id?: string | null
          whatsapp_e164?: string | null
        }
        Update: {
          consent_text?: string
          contact_channel?: Database["public"]["Enums"]["contact_channel"]
          contact_time_label_ar?: string | null
          contact_time_option_id?: string | null
          created_at?: string
          desired_area_label_ar?: string | null
          desired_area_max_m2?: number | null
          desired_area_min_m2?: number | null
          desired_area_option_id?: string | null
          down_payment_label_ar?: string
          down_payment_max_millimes?: number | null
          down_payment_min_millimes?: number | null
          down_payment_option_id?: string
          email?: string | null
          full_name?: string
          goal_code?: string | null
          goal_label_ar?: string
          goal_option_id?: string
          id?: string
          installment_label_ar?: string
          installment_max_millimes?: number | null
          installment_min_millimes?: number | null
          installment_option_id?: string
          invest_anywhere?: boolean
          invest_governorate_ids?: number[]
          is_duplicate?: boolean
          person_id?: string
          phone_e164?: string
          plantation_systems?: string[]
          priority_code?: string | null
          priority_label_ar?: string | null
          priority_option_id?: string | null
          production_statuses?: string[]
          project_type_ids?: string[]
          project_type_unsure?: boolean
          request_no?: string
          residence_delegation_id?: number | null
          residence_governorate_id?: number
          scenario_ids?: string[]
          scenario_labels?: string[]
          source?: Json
          tree_count_code?: string | null
          tree_count_label_ar?: string | null
          tree_count_max?: number | null
          tree_count_min?: number | null
          tree_count_option_id?: string | null
          whatsapp_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interest_requests_contact_time_option_id_fkey"
            columns: ["contact_time_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_desired_area_option_id_fkey"
            columns: ["desired_area_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_down_payment_option_id_fkey"
            columns: ["down_payment_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_goal_option_id_fkey"
            columns: ["goal_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_installment_option_id_fkey"
            columns: ["installment_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_priority_option_id_fkey"
            columns: ["priority_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_residence_delegation_id_fkey"
            columns: ["residence_delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_residence_governorate_id_fkey"
            columns: ["residence_governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_tree_count_option_id_fkey"
            columns: ["tree_count_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
        ]
      }
      land_offer_files: {
        Row: {
          file_name: string
          id: string
          land_offer_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          file_name: string
          id?: string
          land_offer_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          file_name?: string
          id?: string
          land_offer_id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "land_offer_files_land_offer_id_fkey"
            columns: ["land_offer_id"]
            isOneToOne: false
            referencedRelation: "land_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      land_offer_reviews: {
        Row: {
          created_at: string
          id: string
          land_offer_id: string
          notes: string | null
          outcome: string
          reviewer_id: string | null
          stage: Database["public"]["Enums"]["land_offer_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          land_offer_id: string
          notes?: string | null
          outcome: string
          reviewer_id?: string | null
          stage: Database["public"]["Enums"]["land_offer_status"]
        }
        Update: {
          created_at?: string
          id?: string
          land_offer_id?: string
          notes?: string | null
          outcome?: string
          reviewer_id?: string | null
          stage?: Database["public"]["Enums"]["land_offer_status"]
        }
        Relationships: [
          {
            foreignKeyName: "land_offer_reviews_land_offer_id_fkey"
            columns: ["land_offer_id"]
            isOneToOne: false
            referencedRelation: "land_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_offer_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      land_offers: {
        Row: {
          area_unit: string
          area_value: number
          asking_price_millimes: number | null
          available_documents: Json
          consent_text: string
          contact_capacity: Database["public"]["Enums"]["contact_capacity"]
          contact_name: string
          contact_phone_e164: string
          created_at: string
          delegation_id: number
          governorate_id: number
          id: string
          irrigation: Database["public"]["Enums"]["irrigation_type"]
          latitude: number | null
          location_description: string | null
          longitude: number | null
          olive_tree_count: number | null
          price_negotiable: boolean
          property_type_label_ar: string
          property_type_option_id: string
          reference_no: string
          source: Json
          status: Database["public"]["Enums"]["land_offer_status"]
          tree_age_label_ar: string | null
          tree_age_option_id: string | null
          updated_at: string
          water_source: string | null
        }
        Insert: {
          area_unit: string
          area_value: number
          asking_price_millimes?: number | null
          available_documents?: Json
          consent_text: string
          contact_capacity: Database["public"]["Enums"]["contact_capacity"]
          contact_name: string
          contact_phone_e164: string
          created_at?: string
          delegation_id: number
          governorate_id: number
          id?: string
          irrigation: Database["public"]["Enums"]["irrigation_type"]
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          olive_tree_count?: number | null
          price_negotiable?: boolean
          property_type_label_ar: string
          property_type_option_id: string
          reference_no: string
          source?: Json
          status?: Database["public"]["Enums"]["land_offer_status"]
          tree_age_label_ar?: string | null
          tree_age_option_id?: string | null
          updated_at?: string
          water_source?: string | null
        }
        Update: {
          area_unit?: string
          area_value?: number
          asking_price_millimes?: number | null
          available_documents?: Json
          consent_text?: string
          contact_capacity?: Database["public"]["Enums"]["contact_capacity"]
          contact_name?: string
          contact_phone_e164?: string
          created_at?: string
          delegation_id?: number
          governorate_id?: number
          id?: string
          irrigation?: Database["public"]["Enums"]["irrigation_type"]
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          olive_tree_count?: number | null
          price_negotiable?: boolean
          property_type_label_ar?: string
          property_type_option_id?: string
          reference_no?: string
          source?: Json
          status?: Database["public"]["Enums"]["land_offer_status"]
          tree_age_label_ar?: string | null
          tree_age_option_id?: string | null
          updated_at?: string
          water_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "land_offers_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_offers_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_offers_property_type_option_id_fkey"
            columns: ["property_type_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_offers_tree_age_option_id_fkey"
            columns: ["tree_age_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_statuses: {
        Row: {
          id: string
          is_active: boolean
          is_stage_default: boolean
          label_ar: string
          label_fr: string | null
          sort_order: number
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          is_stage_default?: boolean
          label_ar: string
          label_fr?: string | null
          sort_order?: number
          stage: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          is_stage_default?: boolean
          label_ar?: string
          label_fr?: string | null
          sort_order?: number
          stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body_ar: string
          body_fr: string | null
          channel: string
          description_ar: string | null
          is_active: boolean
          key: string
          updated_at: string
          updated_by: string | null
          variables: string[]
        }
        Insert: {
          body_ar: string
          body_fr?: string | null
          channel: string
          description_ar?: string | null
          is_active?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          variables?: string[]
        }
        Update: {
          body_ar?: string
          body_fr?: string | null
          channel?: string
          description_ar?: string | null
          is_active?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          variables?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          body: string
          channel: string
          created_at: string
          id: string
          last_error: string | null
          provider: string | null
          provider_message_id: string | null
          related_entity: string | null
          related_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template_key: string | null
          to_phone_e164: string
        }
        Insert: {
          attempts?: number
          body: string
          channel: string
          created_at?: string
          id?: string
          last_error?: string | null
          provider?: string | null
          provider_message_id?: string | null
          related_entity?: string | null
          related_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_key?: string | null
          to_phone_e164: string
        }
        Update: {
          attempts?: number
          body?: string
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          provider?: string | null
          provider_message_id?: string | null
          related_entity?: string | null
          related_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template_key?: string | null
          to_phone_e164?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      option_items: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          label_ar: string
          label_fr: string | null
          list_key: string
          max_millimes: number | null
          max_number: number | null
          min_millimes: number | null
          min_number: number | null
          sort_order: number
          time_from: string | null
          time_to: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label_ar: string
          label_fr?: string | null
          list_key: string
          max_millimes?: number | null
          max_number?: number | null
          min_millimes?: number | null
          min_number?: number | null
          sort_order?: number
          time_from?: string | null
          time_to?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label_ar?: string
          label_fr?: string | null
          list_key?: string
          max_millimes?: number | null
          max_number?: number | null
          min_millimes?: number | null
          min_number?: number | null
          sort_order?: number
          time_from?: string | null
          time_to?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "option_items_list_key_fkey"
            columns: ["list_key"]
            isOneToOne: false
            referencedRelation: "option_lists"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "option_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      option_lists: {
        Row: {
          description_ar: string | null
          key: string
          label_ar: string
          value_kind: string
        }
        Insert: {
          description_ar?: string | null
          key: string
          label_ar: string
          value_kind: string
        }
        Update: {
          description_ar?: string | null
          key?: string
          label_ar?: string
          value_kind?: string
        }
        Relationships: []
      }
      ownership_scenarios: {
        Row: {
          code: string
          created_at: string
          description_ar: string | null
          id: string
          is_active: boolean
          is_any: boolean
          label_ar: string
          label_fr: string | null
          plantation_system: string | null
          production_status: string | null
          project_type_id: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean
          is_any?: boolean
          label_ar: string
          label_fr?: string | null
          plantation_system?: string | null
          production_status?: string | null
          project_type_id?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description_ar?: string | null
          id?: string
          is_active?: boolean
          is_any?: boolean
          label_ar?: string
          label_fr?: string | null
          plantation_system?: string | null
          production_status?: string | null
          project_type_id?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ownership_scenarios_project_type_id_fkey"
            columns: ["project_type_id"]
            isOneToOne: false
            referencedRelation: "project_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_scenarios_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parcels: {
        Row: {
          annual_costs_millimes: number | null
          area_m2: number
          cash_price_millimes: number
          code: string
          created_at: string
          id: string
          irrigation: Database["public"]["Enums"]["irrigation_type"] | null
          notes: string | null
          olive_tree_count: number | null
          plantation_system: string | null
          pricing: Json | null
          production_status: string | null
          project_id: string
          property_type: string
          sort_order: number
          status: Database["public"]["Enums"]["parcel_status"]
          tree_age_years: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          annual_costs_millimes?: number | null
          area_m2: number
          cash_price_millimes: number
          code: string
          created_at?: string
          id?: string
          irrigation?: Database["public"]["Enums"]["irrigation_type"] | null
          notes?: string | null
          olive_tree_count?: number | null
          plantation_system?: string | null
          pricing?: Json | null
          production_status?: string | null
          project_id: string
          property_type: string
          sort_order?: number
          status?: Database["public"]["Enums"]["parcel_status"]
          tree_age_years?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          annual_costs_millimes?: number | null
          area_m2?: number
          cash_price_millimes?: number
          code?: string
          created_at?: string
          id?: string
          irrigation?: Database["public"]["Enums"]["irrigation_type"] | null
          notes?: string | null
          olive_tree_count?: number | null
          plantation_system?: string | null
          pricing?: Json | null
          production_status?: string | null
          project_id?: string
          property_type?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["parcel_status"]
          tree_age_years?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      person_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          from_user: string | null
          id: string
          person_id: string
          reason: string | null
          to_user: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_user?: string | null
          id?: string
          person_id: string
          reason?: string | null
          to_user?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_user?: string | null
          id?: string
          person_id?: string
          reason?: string | null
          to_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_assignments_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_assignments_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      person_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          person_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string
          id?: string
          person_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_notes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      person_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status_id: string | null
          id: string
          person_id: string
          to_status_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status_id?: string | null
          id?: string
          person_id: string
          to_status_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status_id?: string | null
          id?: string
          person_id?: string
          to_status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_status_history_from_status_id_fkey"
            columns: ["from_status_id"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_status_history_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_status_history_to_status_id_fkey"
            columns: ["to_status_id"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          consent_at: string | null
          created_at: string
          delegation_id: number | null
          email: string | null
          full_name: string
          governorate_id: number | null
          id: string
          last_request_at: string | null
          phone_e164: string
          profile_id: string | null
          status_id: string
          updated_at: string
          whatsapp_e164: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          consent_at?: string | null
          created_at?: string
          delegation_id?: number | null
          email?: string | null
          full_name: string
          governorate_id?: number | null
          id?: string
          last_request_at?: string | null
          phone_e164: string
          profile_id?: string | null
          status_id: string
          updated_at?: string
          whatsapp_e164?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          consent_at?: string | null
          created_at?: string
          delegation_id?: number | null
          email?: string | null
          full_name?: string
          governorate_id?: number | null
          id?: string
          last_request_at?: string | null
          phone_e164?: string
          profile_id?: string | null
          status_id?: string
          updated_at?: string
          whatsapp_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persons_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          locale: string
          phone_e164: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          locale?: string
          phone_e164?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          locale?: string
          phone_e164?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_costs: {
        Row: {
          amount_millimes: number
          created_at: string
          created_by: string | null
          id: string
          kind: string
          label: string
          note: string | null
          project_id: string
        }
        Insert: {
          amount_millimes: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          label: string
          note?: string | null
          project_id: string
        }
        Update: {
          amount_millimes?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string
          note?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_costs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_types: {
        Row: {
          code: string
          created_at: string
          description_ar: string | null
          id: string
          image_alt_ar: string | null
          image_url: string | null
          is_active: boolean
          label_ar: string
          label_fr: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description_ar?: string | null
          id?: string
          image_alt_ar?: string | null
          image_url?: string | null
          is_active?: boolean
          label_ar: string
          label_fr?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description_ar?: string | null
          id?: string
          image_alt_ar?: string | null
          image_url?: string | null
          is_active?: boolean
          label_ar?: string
          label_fr?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          annual_costs_millimes: number | null
          code: string
          created_at: string
          delegation_id: number | null
          governorate_id: number
          id: string
          irrigation: Database["public"]["Enums"]["irrigation_type"] | null
          land_offer_id: string | null
          latitude: number | null
          legal_notes: string | null
          location_description: string | null
          longitude: number | null
          name: string
          olive_variety: string | null
          plan_storage_path: string | null
          plantation_system: string | null
          pricing: Json
          production_status: string | null
          project_type_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          total_area_m2: number | null
          tree_age_years: number | null
          tree_count: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          annual_costs_millimes?: number | null
          code: string
          created_at?: string
          delegation_id?: number | null
          governorate_id: number
          id?: string
          irrigation?: Database["public"]["Enums"]["irrigation_type"] | null
          land_offer_id?: string | null
          latitude?: number | null
          legal_notes?: string | null
          location_description?: string | null
          longitude?: number | null
          name: string
          olive_variety?: string | null
          plan_storage_path?: string | null
          plantation_system?: string | null
          pricing?: Json
          production_status?: string | null
          project_type_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          total_area_m2?: number | null
          tree_age_years?: number | null
          tree_count?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          annual_costs_millimes?: number | null
          code?: string
          created_at?: string
          delegation_id?: number | null
          governorate_id?: number
          id?: string
          irrigation?: Database["public"]["Enums"]["irrigation_type"] | null
          land_offer_id?: string | null
          latitude?: number | null
          legal_notes?: string | null
          location_description?: string | null
          longitude?: number | null
          name?: string
          olive_variety?: string | null
          plan_storage_path?: string | null
          plantation_system?: string | null
          pricing?: Json
          production_status?: string | null
          project_type_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          total_area_m2?: number | null
          tree_age_years?: number | null
          tree_count?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_land_offer_id_fkey"
            columns: ["land_offer_id"]
            isOneToOne: false
            referencedRelation: "land_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_project_type_id_fkey"
            columns: ["project_type_id"]
            isOneToOne: false
            referencedRelation: "project_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          description_ar: string | null
          group_key: string
          is_public: boolean
          key: string
          label_ar: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          value: Json
          value_type: string
        }
        Insert: {
          description_ar?: string | null
          group_key: string
          is_public?: boolean
          key: string
          label_ar: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value: Json
          value_type: string
        }
        Update: {
          description_ar?: string | null
          group_key?: string
          is_public?: boolean
          key?: string
          label_ar?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_media: {
        Row: {
          alt_ar: string | null
          aspect: string
          description_ar: string | null
          group_key: string
          label_ar: string
          slot: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          url: string | null
        }
        Insert: {
          alt_ar?: string | null
          aspect?: string
          description_ar?: string | null
          group_key?: string
          label_ar: string
          slot: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Update: {
          alt_ar?: string | null
          aspect?: string
          description_ar?: string | null
          group_key?: string
          label_ar?: string
          slot?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_media_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      crm_requests: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          consent_text: string | null
          contact_channel: Database["public"]["Enums"]["contact_channel"] | null
          contact_time_label_ar: string | null
          contact_time_option_id: string | null
          created_at: string | null
          desired_area_label_ar: string | null
          desired_area_max_m2: number | null
          desired_area_min_m2: number | null
          desired_area_option_id: string | null
          down_payment_label_ar: string | null
          down_payment_max_millimes: number | null
          down_payment_min_millimes: number | null
          down_payment_option_id: string | null
          email: string | null
          full_name: string | null
          goal_code: string | null
          goal_label_ar: string | null
          goal_option_id: string | null
          id: string | null
          installment_label_ar: string | null
          installment_max_millimes: number | null
          installment_min_millimes: number | null
          installment_option_id: string | null
          invest_anywhere: boolean | null
          invest_governorate_ids: number[] | null
          is_duplicate: boolean | null
          person_archived_at: string | null
          person_id: string | null
          phone_e164: string | null
          plantation_systems: string[] | null
          priority_code: string | null
          priority_label_ar: string | null
          priority_option_id: string | null
          production_statuses: string[] | null
          project_type_ids: string[] | null
          project_type_unsure: boolean | null
          request_no: string | null
          residence_delegation_id: number | null
          residence_governorate_id: number | null
          scenario_ids: string[] | null
          scenario_labels: string[] | null
          source: Json | null
          stage: Database["public"]["Enums"]["lead_stage"] | null
          status_id: string | null
          status_label_ar: string | null
          tree_count_code: string | null
          tree_count_label_ar: string | null
          tree_count_max: number | null
          tree_count_min: number | null
          tree_count_option_id: string | null
          whatsapp_e164: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interest_requests_contact_time_option_id_fkey"
            columns: ["contact_time_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_desired_area_option_id_fkey"
            columns: ["desired_area_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_down_payment_option_id_fkey"
            columns: ["down_payment_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_goal_option_id_fkey"
            columns: ["goal_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_installment_option_id_fkey"
            columns: ["installment_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_priority_option_id_fkey"
            columns: ["priority_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_residence_delegation_id_fkey"
            columns: ["residence_delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_residence_governorate_id_fkey"
            columns: ["residence_governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_tree_count_option_id_fkey"
            columns: ["tree_count_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_assign_persons: {
        Args: { p_person_ids: string[]; p_reason: string; p_to_user: string }
        Returns: number
      }
      admin_set_role: {
        Args: {
          p_grant: boolean
          p_role: Database["public"]["Enums"]["app_role"]
          p_user: string
        }
        Returns: undefined
      }
      admin_set_user_active: {
        Args: { p_active: boolean; p_user: string }
        Returns: undefined
      }
      compute_installment_plan: {
        Args: {
          p_cash_millimes: number
          p_down_millimes: number
          p_installment_millimes: number
          p_pricing: Json
        }
        Returns: Json
      }
      crm_demand_stats: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      crm_search_requests: {
        Args: { p: Json; p_limit?: number; p_offset?: number }
        Returns: {
          assigned_to: string
          assigned_to_name: string
          contact_channel: Database["public"]["Enums"]["contact_channel"]
          contact_time_label_ar: string
          created_at: string
          desired_area_label_ar: string
          desired_area_max_m2: number
          desired_area_min_m2: number
          down_payment_label_ar: string
          down_payment_min_millimes: number
          full_name: string
          goal_code: string
          goal_label_ar: string
          id: string
          installment_label_ar: string
          installment_min_millimes: number
          invest_anywhere: boolean
          invest_governorate_ids: number[]
          is_duplicate: boolean
          person_id: string
          phone_e164: string
          plantation_systems: string[]
          priority_code: string
          priority_label_ar: string
          production_statuses: string[]
          project_type_ids: string[]
          project_type_unsure: boolean
          request_no: string
          residence_delegation_id: number
          residence_governorate_id: number
          scenario_labels: string[]
          source: Json
          stage: Database["public"]["Enums"]["lead_stage"]
          status_id: string
          status_label_ar: string
          total_count: number
          tree_count_code: string
          tree_count_label_ar: string
          tree_count_max: number
          tree_count_min: number
        }[]
      }
      demand_indicator: { Args: { p_governorate: number }; Returns: Json }
      log_action: {
        Args: {
          p_action: string
          p_data?: Json
          p_entity: string
          p_entity_id?: string
          p_reason?: string
        }
        Returns: undefined
      }
      match_requests_for_parcel: {
        Args: { p_limit?: number; p_parcel: string }
        Returns: {
          assigned_to: string
          breakdown: Json
          created_at: string
          full_name: string
          person_id: string
          phone_e164: string
          request_id: string
          request_no: string
          score: number
        }[]
      }
      million_progress: { Args: never; Returns: Json }
      review_land_offer: {
        Args: {
          p_next_status?: Database["public"]["Enums"]["land_offer_status"]
          p_notes: string
          p_offer: string
          p_outcome: string
          p_stage: Database["public"]["Enums"]["land_offer_status"]
        }
        Returns: undefined
      }
      submit_interest_request: { Args: { p: Json }; Returns: Json }
      submit_land_offer: { Args: { p: Json }; Returns: Json }
    }
    Enums: {
      app_role:
        | "client"
        | "commercial"
        | "agri_manager"
        | "finance"
        | "legal"
        | "admin"
        | "super_admin"
      contact_capacity: "owner" | "agent" | "broker"
      contact_channel: "phone" | "whatsapp" | "both"
      contact_outcome:
        | "answered"
        | "no_answer"
        | "wrong_number"
        | "callback"
        | "not_interested"
      flag_state: "disabled" | "internal" | "public"
      irrigation_type: "rainfed" | "irrigated"
      land_offer_status:
        | "under_study"
        | "legal_review"
        | "technical_review"
        | "field_visit"
        | "accepted"
        | "rejected"
        | "postponed"
        | "converted"
      lead_stage:
        | "new"
        | "contacting"
        | "qualified"
        | "proposed"
        | "visit"
        | "reserved"
        | "contracting"
        | "owner"
        | "paused"
        | "closed"
      notification_status: "pending" | "sending" | "sent" | "failed" | "skipped"
      parcel_status:
        | "available"
        | "interested"
        | "reserved"
        | "contracting"
        | "sold"
        | "withdrawn"
      project_status:
        | "draft"
        | "preparing"
        | "internal"
        | "published"
        | "sold_out"
        | "operating"
        | "archived"
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
    Enums: {
      app_role: [
        "client",
        "commercial",
        "agri_manager",
        "finance",
        "legal",
        "admin",
        "super_admin",
      ],
      contact_capacity: ["owner", "agent", "broker"],
      contact_channel: ["phone", "whatsapp", "both"],
      contact_outcome: [
        "answered",
        "no_answer",
        "wrong_number",
        "callback",
        "not_interested",
      ],
      flag_state: ["disabled", "internal", "public"],
      irrigation_type: ["rainfed", "irrigated"],
      land_offer_status: [
        "under_study",
        "legal_review",
        "technical_review",
        "field_visit",
        "accepted",
        "rejected",
        "postponed",
        "converted",
      ],
      lead_stage: [
        "new",
        "contacting",
        "qualified",
        "proposed",
        "visit",
        "reserved",
        "contracting",
        "owner",
        "paused",
        "closed",
      ],
      notification_status: ["pending", "sending", "sent", "failed", "skipped"],
      parcel_status: [
        "available",
        "interested",
        "reserved",
        "contracting",
        "sold",
        "withdrawn",
      ],
      project_status: [
        "draft",
        "preparing",
        "internal",
        "published",
        "sold_out",
        "operating",
        "archived",
      ],
    },
  },
} as const
