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
      agri_operation_trees: {
        Row: {
          operation_id: string
          tree_id: string
        }
        Insert: {
          operation_id: string
          tree_id: string
        }
        Update: {
          operation_id?: string
          tree_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agri_operation_trees_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "agri_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_operation_trees_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      agri_operations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cost_millimes: number | null
          created_at: string
          created_by: string | null
          executed_on: string | null
          id: string
          label_ar: string
          note: string | null
          planned_on: string | null
          project_id: string
          provider_note: string | null
          provider_option_id: string | null
          scope: string
          service_option_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cost_millimes?: number | null
          created_at?: string
          created_by?: string | null
          executed_on?: string | null
          id?: string
          label_ar: string
          note?: string | null
          planned_on?: string | null
          project_id: string
          provider_note?: string | null
          provider_option_id?: string | null
          scope?: string
          service_option_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cost_millimes?: number | null
          created_at?: string
          created_by?: string | null
          executed_on?: string | null
          id?: string
          label_ar?: string
          note?: string | null
          planned_on?: string | null
          project_id?: string
          provider_note?: string | null
          provider_option_id?: string | null
          scope?: string
          service_option_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agri_operations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_operations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_operations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_operations_provider_option_id_fkey"
            columns: ["provider_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_operations_service_option_id_fkey"
            columns: ["service_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_operations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          answer: string | null
          created_at: string
          error: string | null
          id: string
          ip_hash: string | null
          model: string | null
          question: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          answer?: string | null
          created_at?: string
          error?: string | null
          id?: string
          ip_hash?: string | null
          model?: string | null
          question: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          answer?: string | null
          created_at?: string
          error?: string | null
          id?: string
          ip_hash?: string | null
          model?: string | null
          question?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: []
      }
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
      client_login_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          person_id: string
          phone_e164: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          person_id: string
          phone_e164: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          person_id?: string
          phone_e164?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_login_codes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
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
      contract_installments: {
        Row: {
          amount_millimes: number
          contract_id: string
          created_at: string
          due_on: string
          id: string
          note: string | null
          seq: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_millimes: number
          contract_id: string
          created_at?: string
          due_on: string
          id?: string
          note?: string | null
          seq: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_millimes?: number
          contract_id?: string
          created_at?: string
          due_on?: string
          id?: string
          note?: string | null
          seq?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_installments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_installments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          deposit_credited_millimes: number
          down_payment_millimes: number
          down_payment_percent: number | null
          duration_months: number | null
          first_due_on: string | null
          id: string
          installments_count: number | null
          kind_label_ar: string | null
          kind_option_id: string | null
          last_installment_millimes: number | null
          legal_document_ref: string | null
          markup_bp: number | null
          method_label_ar: string | null
          method_option_id: string | null
          monthly_millimes: number | null
          note: string | null
          owned_at: string | null
          owned_by: string | null
          payment_mode: string
          person_id: string
          plan_shortened: boolean | null
          price_per_tree_millimes: number
          project_id: string
          reference_no: string
          remaining_millimes: number | null
          request_id: string | null
          reservation_id: string
          schedule_generated_at: string | null
          settled_at: string | null
          signed_by: string | null
          signed_on: string | null
          status: Database["public"]["Enums"]["contract_status"]
          total_financed_millimes: number | null
          total_price_millimes: number
          trees_count: number
          trees_released: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          deposit_credited_millimes?: number
          down_payment_millimes: number
          down_payment_percent?: number | null
          duration_months?: number | null
          first_due_on?: string | null
          id?: string
          installments_count?: number | null
          kind_label_ar?: string | null
          kind_option_id?: string | null
          last_installment_millimes?: number | null
          legal_document_ref?: string | null
          markup_bp?: number | null
          method_label_ar?: string | null
          method_option_id?: string | null
          monthly_millimes?: number | null
          note?: string | null
          owned_at?: string | null
          owned_by?: string | null
          payment_mode: string
          person_id: string
          plan_shortened?: boolean | null
          price_per_tree_millimes: number
          project_id: string
          reference_no: string
          remaining_millimes?: number | null
          request_id?: string | null
          reservation_id: string
          schedule_generated_at?: string | null
          settled_at?: string | null
          signed_by?: string | null
          signed_on?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          total_financed_millimes?: number | null
          total_price_millimes: number
          trees_count: number
          trees_released?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          deposit_credited_millimes?: number
          down_payment_millimes?: number
          down_payment_percent?: number | null
          duration_months?: number | null
          first_due_on?: string | null
          id?: string
          installments_count?: number | null
          kind_label_ar?: string | null
          kind_option_id?: string | null
          last_installment_millimes?: number | null
          legal_document_ref?: string | null
          markup_bp?: number | null
          method_label_ar?: string | null
          method_option_id?: string | null
          monthly_millimes?: number | null
          note?: string | null
          owned_at?: string | null
          owned_by?: string | null
          payment_mode?: string
          person_id?: string
          plan_shortened?: boolean | null
          price_per_tree_millimes?: number
          project_id?: string
          reference_no?: string
          remaining_millimes?: number | null
          request_id?: string | null
          reservation_id?: string
          schedule_generated_at?: string | null
          settled_at?: string | null
          signed_by?: string | null
          signed_on?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          total_financed_millimes?: number | null
          total_price_millimes?: number
          trees_count?: number
          trees_released?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_kind_option_id_fkey"
            columns: ["kind_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_method_option_id_fkey"
            columns: ["method_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_owned_by_fkey"
            columns: ["owned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "crm_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "interest_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_signed_by_fkey"
            columns: ["signed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      financing_markups: {
        Row: {
          id: string
          markup_bp: number
          months: number
          project_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          markup_bp: number
          months: number
          project_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          markup_bp?: number
          months?: number
          project_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financing_markups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financing_markups_updated_by_fkey"
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
          map_col: number | null
          map_row: number | null
          name_ar: string
          name_fr: string
          sort_order: number
        }
        Insert: {
          id: number
          is_active?: boolean
          map_col?: number | null
          map_row?: number | null
          name_ar: string
          name_fr: string
          sort_order?: number
        }
        Update: {
          id?: number
          is_active?: boolean
          map_col?: number | null
          map_row?: number | null
          name_ar?: string
          name_fr?: string
          sort_order?: number
        }
        Relationships: []
      }
      harvest_choices: {
        Row: {
          created_at: string
          decided_at: string
          decided_by: string | null
          id: string
          note: string | null
          outcome_option_id: string | null
          person_id: string
          pick_option_id: string | null
          season_id: string
          source: Database["public"]["Enums"]["harvest_choice_source"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          id?: string
          note?: string | null
          outcome_option_id?: string | null
          person_id: string
          pick_option_id?: string | null
          season_id: string
          source?: Database["public"]["Enums"]["harvest_choice_source"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          id?: string
          note?: string | null
          outcome_option_id?: string | null
          person_id?: string
          pick_option_id?: string | null
          season_id?: string
          source?: Database["public"]["Enums"]["harvest_choice_source"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harvest_choices_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_choices_outcome_option_id_fkey"
            columns: ["outcome_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_choices_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_choices_pick_option_id_fkey"
            columns: ["pick_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_choices_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "harvest_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_choices_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_seasons: {
        Row: {
          choice_deadline: string | null
          created_at: string
          ended_on: string | null
          estimated_olives_kg: number | null
          harvest_cost_millimes: number | null
          id: string
          label_ar: string
          note: string | null
          oil_litres: number | null
          olives_kg: number | null
          pressed_olives_kg: number | null
          project_id: string
          sale_amount_millimes: number | null
          season_year: number
          settled_at: string | null
          settled_by: string | null
          sold_oil_litres: number | null
          sold_olives_kg: number | null
          started_on: string | null
          status: Database["public"]["Enums"]["harvest_season_status"]
          stored_oil_litres: number | null
          trees_harvested: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          choice_deadline?: string | null
          created_at?: string
          ended_on?: string | null
          estimated_olives_kg?: number | null
          harvest_cost_millimes?: number | null
          id?: string
          label_ar: string
          note?: string | null
          oil_litres?: number | null
          olives_kg?: number | null
          pressed_olives_kg?: number | null
          project_id: string
          sale_amount_millimes?: number | null
          season_year: number
          settled_at?: string | null
          settled_by?: string | null
          sold_oil_litres?: number | null
          sold_olives_kg?: number | null
          started_on?: string | null
          status?: Database["public"]["Enums"]["harvest_season_status"]
          stored_oil_litres?: number | null
          trees_harvested?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          choice_deadline?: string | null
          created_at?: string
          ended_on?: string | null
          estimated_olives_kg?: number | null
          harvest_cost_millimes?: number | null
          id?: string
          label_ar?: string
          note?: string | null
          oil_litres?: number | null
          olives_kg?: number | null
          pressed_olives_kg?: number | null
          project_id?: string
          sale_amount_millimes?: number | null
          season_year?: number
          settled_at?: string | null
          settled_by?: string | null
          sold_oil_litres?: number | null
          sold_olives_kg?: number | null
          started_on?: string | null
          status?: Database["public"]["Enums"]["harvest_season_status"]
          stored_oil_litres?: number | null
          trees_harvested?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harvest_seasons_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_seasons_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_seasons_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_shares: {
        Row: {
          choice_source:
            | Database["public"]["Enums"]["harvest_choice_source"]
            | null
          counted_at: string
          created_at: string
          id: string
          note: string | null
          oil_litres: number | null
          olives_kg: number
          outcome_label_ar: string | null
          outcome_option_id: string | null
          person_id: string
          pick_label_ar: string | null
          pick_option_id: string | null
          season_id: string
          settled_by: string | null
          trees_harvested: number
          trees_held: number
        }
        Insert: {
          choice_source?:
            | Database["public"]["Enums"]["harvest_choice_source"]
            | null
          counted_at?: string
          created_at?: string
          id?: string
          note?: string | null
          oil_litres?: number | null
          olives_kg: number
          outcome_label_ar?: string | null
          outcome_option_id?: string | null
          person_id: string
          pick_label_ar?: string | null
          pick_option_id?: string | null
          season_id: string
          settled_by?: string | null
          trees_harvested: number
          trees_held: number
        }
        Update: {
          choice_source?:
            | Database["public"]["Enums"]["harvest_choice_source"]
            | null
          counted_at?: string
          created_at?: string
          id?: string
          note?: string | null
          oil_litres?: number | null
          olives_kg?: number
          outcome_label_ar?: string | null
          outcome_option_id?: string | null
          person_id?: string
          pick_label_ar?: string | null
          pick_option_id?: string | null
          season_id?: string
          settled_by?: string | null
          trees_harvested?: number
          trees_held?: number
        }
        Relationships: [
          {
            foreignKeyName: "harvest_shares_outcome_option_id_fkey"
            columns: ["outcome_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_shares_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_shares_pick_option_id_fkey"
            columns: ["pick_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_shares_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "harvest_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_shares_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_requests: {
        Row: {
          area_per_tree_m2: number | null
          budget_label_ar: string | null
          budget_max_millimes: number | null
          budget_min_millimes: number | null
          budget_option_id: string | null
          consent_text: string
          contact_channel: Database["public"]["Enums"]["contact_channel"]
          contact_time_label_ar: string | null
          contact_time_option_id: string | null
          created_at: string
          desired_area_label_ar: string | null
          desired_area_max_m2: number | null
          desired_area_min_m2: number | null
          desired_area_option_id: string | null
          down_payment_amount_millimes: number | null
          down_payment_label_ar: string | null
          down_payment_max_millimes: number | null
          down_payment_min_millimes: number | null
          down_payment_option_id: string | null
          down_payment_percent: number | null
          down_payment_percent_option_id: string | null
          duration_label_ar: string | null
          duration_months: number | null
          duration_option_id: string | null
          email: string | null
          full_name: string
          goal_code: string | null
          goal_label_ar: string | null
          goal_option_id: string | null
          id: string
          installment_label_ar: string | null
          installment_max_millimes: number | null
          installment_min_millimes: number | null
          installment_option_id: string | null
          invest_anywhere: boolean
          invest_governorate_ids: number[]
          is_duplicate: boolean
          monthly_millimes: number | null
          offer_annual_fee_per_tree_millimes: number | null
          offer_annual_fee_total_millimes: number | null
          offer_price_per_tree_millimes: number | null
          offer_total_price_millimes: number | null
          offer_trees: number | null
          parcel_area_m2: number | null
          parcel_captured_at: string | null
          parcel_cash_price_millimes: number | null
          parcel_code: string | null
          parcel_id: string | null
          parcel_olive_tree_count: number | null
          parcel_plan_last_millimes: number | null
          parcel_plan_months: number | null
          parcel_plan_total_millimes: number | null
          parcel_plantation_system: string | null
          parcel_production_status: string | null
          parcel_property_type: string | null
          payment_mode: string | null
          person_id: string
          phone_e164: string
          plantation_systems: string[]
          price_per_tree_millimes: number | null
          priority_code: string | null
          priority_label_ar: string | null
          priority_option_id: string | null
          production_statuses: string[]
          project_code: string | null
          project_id: string | null
          project_name: string | null
          project_type_ids: string[]
          project_type_unsure: boolean
          request_kind: string
          request_no: string
          residence_delegation_id: number | null
          residence_governorate_id: number
          scenario_ids: string[]
          scenario_labels: string[]
          source: Json
          spacing_class_id: string | null
          spacing_label_ar: string | null
          total_area_m2: number | null
          total_financed_millimes: number | null
          total_price_millimes: number | null
          tree_count_code: string | null
          tree_count_label_ar: string | null
          tree_count_max: number | null
          tree_count_min: number | null
          tree_count_option_id: string | null
          wants_bank_financing: boolean | null
          wants_visit: boolean | null
          whatsapp_e164: string | null
        }
        Insert: {
          area_per_tree_m2?: number | null
          budget_label_ar?: string | null
          budget_max_millimes?: number | null
          budget_min_millimes?: number | null
          budget_option_id?: string | null
          consent_text: string
          contact_channel: Database["public"]["Enums"]["contact_channel"]
          contact_time_label_ar?: string | null
          contact_time_option_id?: string | null
          created_at?: string
          desired_area_label_ar?: string | null
          desired_area_max_m2?: number | null
          desired_area_min_m2?: number | null
          desired_area_option_id?: string | null
          down_payment_amount_millimes?: number | null
          down_payment_label_ar?: string | null
          down_payment_max_millimes?: number | null
          down_payment_min_millimes?: number | null
          down_payment_option_id?: string | null
          down_payment_percent?: number | null
          down_payment_percent_option_id?: string | null
          duration_label_ar?: string | null
          duration_months?: number | null
          duration_option_id?: string | null
          email?: string | null
          full_name: string
          goal_code?: string | null
          goal_label_ar?: string | null
          goal_option_id?: string | null
          id?: string
          installment_label_ar?: string | null
          installment_max_millimes?: number | null
          installment_min_millimes?: number | null
          installment_option_id?: string | null
          invest_anywhere?: boolean
          invest_governorate_ids?: number[]
          is_duplicate?: boolean
          monthly_millimes?: number | null
          offer_annual_fee_per_tree_millimes?: number | null
          offer_annual_fee_total_millimes?: number | null
          offer_price_per_tree_millimes?: number | null
          offer_total_price_millimes?: number | null
          offer_trees?: number | null
          parcel_area_m2?: number | null
          parcel_captured_at?: string | null
          parcel_cash_price_millimes?: number | null
          parcel_code?: string | null
          parcel_id?: string | null
          parcel_olive_tree_count?: number | null
          parcel_plan_last_millimes?: number | null
          parcel_plan_months?: number | null
          parcel_plan_total_millimes?: number | null
          parcel_plantation_system?: string | null
          parcel_production_status?: string | null
          parcel_property_type?: string | null
          payment_mode?: string | null
          person_id: string
          phone_e164: string
          plantation_systems?: string[]
          price_per_tree_millimes?: number | null
          priority_code?: string | null
          priority_label_ar?: string | null
          priority_option_id?: string | null
          production_statuses?: string[]
          project_code?: string | null
          project_id?: string | null
          project_name?: string | null
          project_type_ids?: string[]
          project_type_unsure?: boolean
          request_kind?: string
          request_no: string
          residence_delegation_id?: number | null
          residence_governorate_id: number
          scenario_ids?: string[]
          scenario_labels?: string[]
          source?: Json
          spacing_class_id?: string | null
          spacing_label_ar?: string | null
          total_area_m2?: number | null
          total_financed_millimes?: number | null
          total_price_millimes?: number | null
          tree_count_code?: string | null
          tree_count_label_ar?: string | null
          tree_count_max?: number | null
          tree_count_min?: number | null
          tree_count_option_id?: string | null
          wants_bank_financing?: boolean | null
          wants_visit?: boolean | null
          whatsapp_e164?: string | null
        }
        Update: {
          area_per_tree_m2?: number | null
          budget_label_ar?: string | null
          budget_max_millimes?: number | null
          budget_min_millimes?: number | null
          budget_option_id?: string | null
          consent_text?: string
          contact_channel?: Database["public"]["Enums"]["contact_channel"]
          contact_time_label_ar?: string | null
          contact_time_option_id?: string | null
          created_at?: string
          desired_area_label_ar?: string | null
          desired_area_max_m2?: number | null
          desired_area_min_m2?: number | null
          desired_area_option_id?: string | null
          down_payment_amount_millimes?: number | null
          down_payment_label_ar?: string | null
          down_payment_max_millimes?: number | null
          down_payment_min_millimes?: number | null
          down_payment_option_id?: string | null
          down_payment_percent?: number | null
          down_payment_percent_option_id?: string | null
          duration_label_ar?: string | null
          duration_months?: number | null
          duration_option_id?: string | null
          email?: string | null
          full_name?: string
          goal_code?: string | null
          goal_label_ar?: string | null
          goal_option_id?: string | null
          id?: string
          installment_label_ar?: string | null
          installment_max_millimes?: number | null
          installment_min_millimes?: number | null
          installment_option_id?: string | null
          invest_anywhere?: boolean
          invest_governorate_ids?: number[]
          is_duplicate?: boolean
          monthly_millimes?: number | null
          offer_annual_fee_per_tree_millimes?: number | null
          offer_annual_fee_total_millimes?: number | null
          offer_price_per_tree_millimes?: number | null
          offer_total_price_millimes?: number | null
          offer_trees?: number | null
          parcel_area_m2?: number | null
          parcel_captured_at?: string | null
          parcel_cash_price_millimes?: number | null
          parcel_code?: string | null
          parcel_id?: string | null
          parcel_olive_tree_count?: number | null
          parcel_plan_last_millimes?: number | null
          parcel_plan_months?: number | null
          parcel_plan_total_millimes?: number | null
          parcel_plantation_system?: string | null
          parcel_production_status?: string | null
          parcel_property_type?: string | null
          payment_mode?: string | null
          person_id?: string
          phone_e164?: string
          plantation_systems?: string[]
          price_per_tree_millimes?: number | null
          priority_code?: string | null
          priority_label_ar?: string | null
          priority_option_id?: string | null
          production_statuses?: string[]
          project_code?: string | null
          project_id?: string | null
          project_name?: string | null
          project_type_ids?: string[]
          project_type_unsure?: boolean
          request_kind?: string
          request_no?: string
          residence_delegation_id?: number | null
          residence_governorate_id?: number
          scenario_ids?: string[]
          scenario_labels?: string[]
          source?: Json
          spacing_class_id?: string | null
          spacing_label_ar?: string | null
          total_area_m2?: number | null
          total_financed_millimes?: number | null
          total_price_millimes?: number | null
          tree_count_code?: string | null
          tree_count_label_ar?: string | null
          tree_count_max?: number | null
          tree_count_min?: number | null
          tree_count_option_id?: string | null
          wants_bank_financing?: boolean | null
          wants_visit?: boolean | null
          whatsapp_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interest_requests_budget_option_id_fkey"
            columns: ["budget_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "interest_requests_down_payment_percent_option_id_fkey"
            columns: ["down_payment_percent_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_duration_option_id_fkey"
            columns: ["duration_option_id"]
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
            foreignKeyName: "interest_requests_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
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
            foreignKeyName: "interest_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
            foreignKeyName: "interest_requests_spacing_class_id_fkey"
            columns: ["spacing_class_id"]
            isOneToOne: false
            referencedRelation: "tree_spacing_classes"
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
      legal_appointments: {
        Row: {
          cancel_reason: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          documents_note: string | null
          id: string
          legal_file_id: string
          meet_at: string | null
          meet_on: string
          note: string | null
          partner_id: string | null
          partner_label_ar: string | null
          person_id: string
          place: string | null
          status: Database["public"]["Enums"]["legal_appointment_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancel_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          documents_note?: string | null
          id?: string
          legal_file_id: string
          meet_at?: string | null
          meet_on: string
          note?: string | null
          partner_id?: string | null
          partner_label_ar?: string | null
          person_id: string
          place?: string | null
          status?: Database["public"]["Enums"]["legal_appointment_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancel_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          documents_note?: string | null
          id?: string
          legal_file_id?: string
          meet_at?: string | null
          meet_on?: string
          note?: string | null
          partner_id?: string | null
          partner_label_ar?: string | null
          person_id?: string
          place?: string | null
          status?: Database["public"]["Enums"]["legal_appointment_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_appointments_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_appointments_legal_file_id_fkey"
            columns: ["legal_file_id"]
            isOneToOne: false
            referencedRelation: "legal_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_appointments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_appointments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_appointments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_checklist_items: {
        Row: {
          code: string
          created_at: string
          help_ar: string | null
          id: string
          is_active: boolean
          is_mandatory: boolean
          label_ar: string
          required_at: Database["public"]["Enums"]["legal_gate"]
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          help_ar?: string | null
          id?: string
          is_active?: boolean
          is_mandatory?: boolean
          label_ar: string
          required_at?: Database["public"]["Enums"]["legal_gate"]
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          help_ar?: string | null
          id?: string
          is_active?: boolean
          is_mandatory?: boolean
          label_ar?: string
          required_at?: Database["public"]["Enums"]["legal_gate"]
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_checklist_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_file_checks: {
        Row: {
          code: string
          created_at: string
          done_at: string | null
          done_by: string | null
          id: string
          is_mandatory: boolean
          item_id: string | null
          label_ar: string
          legal_file_id: string
          note: string | null
          required_at: Database["public"]["Enums"]["legal_gate"]
          sort_order: number
          updated_at: string
          updated_by: string | null
          waive_reason: string | null
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          is_mandatory: boolean
          item_id?: string | null
          label_ar: string
          legal_file_id: string
          note?: string | null
          required_at: Database["public"]["Enums"]["legal_gate"]
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          waive_reason?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          is_mandatory?: boolean
          item_id?: string | null
          label_ar?: string
          legal_file_id?: string
          note?: string | null
          required_at?: Database["public"]["Enums"]["legal_gate"]
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          waive_reason?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_file_checks_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_file_checks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "legal_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_file_checks_legal_file_id_fkey"
            columns: ["legal_file_id"]
            isOneToOne: false
            referencedRelation: "legal_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_file_checks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_file_checks_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_files: {
        Row: {
          created_at: string
          id: string
          note: string | null
          opened_at: string
          opened_by: string | null
          person_id: string
          project_id: string
          reservation_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          person_id: string
          project_id: string
          reservation_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          person_id?: string
          project_id?: string
          reservation_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_files_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_files_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_files_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_files_updated_by_fkey"
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
          description_fr: string | null
          icon_code: string | null
          id: string
          image_alt_ar: string | null
          image_alt_fr: string | null
          image_url: string | null
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
          description_fr?: string | null
          icon_code?: string | null
          id?: string
          image_alt_ar?: string | null
          image_alt_fr?: string | null
          image_url?: string | null
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
          description_fr?: string | null
          icon_code?: string | null
          id?: string
          image_alt_ar?: string | null
          image_alt_fr?: string | null
          image_url?: string | null
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
          spacing_class_id: string | null
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
          spacing_class_id?: string | null
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
          spacing_class_id?: string | null
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
            foreignKeyName: "parcels_spacing_class_id_fkey"
            columns: ["spacing_class_id"]
            isOneToOne: false
            referencedRelation: "tree_spacing_classes"
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
      partners: {
        Row: {
          availability_note: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          governorate_id: number | null
          id: string
          is_active: boolean
          is_available: boolean
          note: string | null
          office_name: string | null
          phone_e164: string | null
          speciality_label_ar: string | null
          speciality_option_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          availability_note?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          governorate_id?: number | null
          id?: string
          is_active?: boolean
          is_available?: boolean
          note?: string | null
          office_name?: string | null
          phone_e164?: string | null
          speciality_label_ar?: string | null
          speciality_option_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          availability_note?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          governorate_id?: number | null
          id?: string
          is_active?: boolean
          is_available?: boolean
          note?: string | null
          office_name?: string | null
          phone_e164?: string | null
          speciality_label_ar?: string | null
          speciality_option_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_speciality_option_id_fkey"
            columns: ["speciality_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_millimes: number
          contract_id: string | null
          created_at: string
          id: string
          installment_id: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          method_label_ar: string | null
          method_option_id: string | null
          note: string | null
          person_id: string
          project_id: string | null
          received_at: string
          recorded_by: string | null
          reference: string | null
          reference_no: string
          reservation_id: string | null
          updated_at: string
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_millimes: number
          contract_id?: string | null
          created_at?: string
          id?: string
          installment_id?: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          method_label_ar?: string | null
          method_option_id?: string | null
          note?: string | null
          person_id: string
          project_id?: string | null
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
          reference_no: string
          reservation_id?: string | null
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_millimes?: number
          contract_id?: string | null
          created_at?: string
          id?: string
          installment_id?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          method_label_ar?: string | null
          method_option_id?: string | null
          note?: string | null
          person_id?: string
          project_id?: string | null
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
          reference_no?: string
          reservation_id?: string | null
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "contract_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_method_option_id_fkey"
            columns: ["method_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_voided_by_fkey"
            columns: ["voided_by"]
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
      person_views: {
        Row: {
          person_id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          person_id: string
          seen_at?: string
          user_id: string
        }
        Update: {
          person_id?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_views_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          address_line: string | null
          archived_at: string | null
          assigned_to: string | null
          birth_date: string | null
          birth_place: string | null
          cin: string | null
          cin_issued_on: string | null
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
          address_line?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          birth_date?: string | null
          birth_place?: string | null
          cin?: string | null
          cin_issued_on?: string | null
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
          address_line?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          birth_date?: string | null
          birth_place?: string | null
          cin?: string | null
          cin_issued_on?: string | null
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
      project_down_payment_percents: {
        Row: {
          created_at: string
          created_by: string | null
          option_item_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          option_item_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          option_item_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_down_payment_percents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_down_payment_percents_option_item_id_fkey"
            columns: ["option_item_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_down_payment_percents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_media: {
        Row: {
          alt_ar: string
          caption_ar: string | null
          created_at: string
          created_by: string | null
          id: string
          is_cover: boolean
          project_id: string
          sort_order: number
          storage_path: string | null
          url: string
        }
        Insert: {
          alt_ar: string
          caption_ar?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_cover?: boolean
          project_id: string
          sort_order?: number
          storage_path?: string | null
          url: string
        }
        Update: {
          alt_ar?: string
          caption_ar?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_cover?: boolean
          project_id?: string
          sort_order?: number
          storage_path?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_media_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_service_terms: {
        Row: {
          amount_millimes: number
          basis: string
          created_at: string
          frequency_option_id: string | null
          id: string
          in_annual_package: boolean
          is_active: boolean
          label_ar: string
          note: string | null
          project_id: string | null
          provider_note: string | null
          provider_option_id: string | null
          service_option_id: string
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_millimes?: number
          basis: string
          created_at?: string
          frequency_option_id?: string | null
          id?: string
          in_annual_package?: boolean
          is_active?: boolean
          label_ar: string
          note?: string | null
          project_id?: string | null
          provider_note?: string | null
          provider_option_id?: string | null
          service_option_id: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_millimes?: number
          basis?: string
          created_at?: string
          frequency_option_id?: string | null
          id?: string
          in_annual_package?: boolean
          is_active?: boolean
          label_ar?: string
          note?: string | null
          project_id?: string | null
          provider_note?: string | null
          provider_option_id?: string | null
          service_option_id?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_service_terms_frequency_option_id_fkey"
            columns: ["frequency_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_terms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_terms_provider_option_id_fkey"
            columns: ["provider_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_terms_service_option_id_fkey"
            columns: ["service_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_terms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_spacing_classes: {
        Row: {
          created_at: string
          created_by: string | null
          project_id: string
          spacing_class_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          project_id: string
          spacing_class_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          project_id?: string
          spacing_class_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_spacing_classes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_spacing_classes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_spacing_classes_spacing_class_id_fkey"
            columns: ["spacing_class_id"]
            isOneToOne: false
            referencedRelation: "tree_spacing_classes"
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
          access_note: string | null
          allows_installments: boolean
          annual_costs_millimes: number | null
          code: string
          created_at: string
          delegation_id: number | null
          description_ar: string | null
          document_option_ids: string[]
          governorate_id: number
          harvest_outcome_default_id: string | null
          harvest_outcome_option_ids: string[]
          harvest_pick_default_id: string | null
          harvest_pick_option_ids: string[]
          id: string
          irrigation: Database["public"]["Enums"]["irrigation_type"] | null
          land_offer_id: string | null
          latitude: number | null
          legal_notes: string | null
          location_description: string | null
          longitude: number | null
          min_trees_per_order: number | null
          name: string
          olive_variety: string | null
          plan_storage_path: string | null
          plantation_system: string | null
          pricing: Json
          production_status: string | null
          project_type_id: string | null
          reservation_conditions_ar: string | null
          reservation_deposit_millimes: number | null
          reservation_valid_days: number | null
          service_option_ids: string[]
          show_location: boolean
          status: Database["public"]["Enums"]["project_status"]
          total_area_m2: number | null
          tree_age_years: number | null
          tree_code_pattern: string | null
          tree_count: number | null
          updated_at: string
          updated_by: string | null
          video_url: string | null
          visit_meeting_point: string | null
          water_available: boolean | null
          water_note: string | null
        }
        Insert: {
          access_note?: string | null
          allows_installments?: boolean
          annual_costs_millimes?: number | null
          code: string
          created_at?: string
          delegation_id?: number | null
          description_ar?: string | null
          document_option_ids?: string[]
          governorate_id: number
          harvest_outcome_default_id?: string | null
          harvest_outcome_option_ids?: string[]
          harvest_pick_default_id?: string | null
          harvest_pick_option_ids?: string[]
          id?: string
          irrigation?: Database["public"]["Enums"]["irrigation_type"] | null
          land_offer_id?: string | null
          latitude?: number | null
          legal_notes?: string | null
          location_description?: string | null
          longitude?: number | null
          min_trees_per_order?: number | null
          name: string
          olive_variety?: string | null
          plan_storage_path?: string | null
          plantation_system?: string | null
          pricing?: Json
          production_status?: string | null
          project_type_id?: string | null
          reservation_conditions_ar?: string | null
          reservation_deposit_millimes?: number | null
          reservation_valid_days?: number | null
          service_option_ids?: string[]
          show_location?: boolean
          status?: Database["public"]["Enums"]["project_status"]
          total_area_m2?: number | null
          tree_age_years?: number | null
          tree_code_pattern?: string | null
          tree_count?: number | null
          updated_at?: string
          updated_by?: string | null
          video_url?: string | null
          visit_meeting_point?: string | null
          water_available?: boolean | null
          water_note?: string | null
        }
        Update: {
          access_note?: string | null
          allows_installments?: boolean
          annual_costs_millimes?: number | null
          code?: string
          created_at?: string
          delegation_id?: number | null
          description_ar?: string | null
          document_option_ids?: string[]
          governorate_id?: number
          harvest_outcome_default_id?: string | null
          harvest_outcome_option_ids?: string[]
          harvest_pick_default_id?: string | null
          harvest_pick_option_ids?: string[]
          id?: string
          irrigation?: Database["public"]["Enums"]["irrigation_type"] | null
          land_offer_id?: string | null
          latitude?: number | null
          legal_notes?: string | null
          location_description?: string | null
          longitude?: number | null
          min_trees_per_order?: number | null
          name?: string
          olive_variety?: string | null
          plan_storage_path?: string | null
          plantation_system?: string | null
          pricing?: Json
          production_status?: string | null
          project_type_id?: string | null
          reservation_conditions_ar?: string | null
          reservation_deposit_millimes?: number | null
          reservation_valid_days?: number | null
          service_option_ids?: string[]
          show_location?: boolean
          status?: Database["public"]["Enums"]["project_status"]
          total_area_m2?: number | null
          tree_age_years?: number | null
          tree_code_pattern?: string | null
          tree_count?: number | null
          updated_at?: string
          updated_by?: string | null
          video_url?: string | null
          visit_meeting_point?: string | null
          water_available?: boolean | null
          water_note?: string | null
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
            foreignKeyName: "projects_harvest_outcome_default_id_fkey"
            columns: ["harvest_outcome_default_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_harvest_pick_default_id_fkey"
            columns: ["harvest_pick_default_id"]
            isOneToOne: false
            referencedRelation: "option_items"
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
      reservations: {
        Row: {
          close_reason: string | null
          closed_at: string | null
          closed_by: string | null
          conditions_ar: string | null
          created_at: string
          created_by: string | null
          deposit_due_millimes: number
          deposit_paid_at: string | null
          expires_at: string | null
          extended_at: string | null
          extended_count: number
          id: string
          note: string | null
          person_id: string
          project_id: string
          reference_no: string
          request_id: string | null
          reserved_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          trees_count: number
          trees_released: boolean
          updated_at: string
          updated_by: string | null
          valid_days: number
        }
        Insert: {
          close_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          conditions_ar?: string | null
          created_at?: string
          created_by?: string | null
          deposit_due_millimes: number
          deposit_paid_at?: string | null
          expires_at?: string | null
          extended_at?: string | null
          extended_count?: number
          id?: string
          note?: string | null
          person_id: string
          project_id: string
          reference_no: string
          request_id?: string | null
          reserved_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          trees_count: number
          trees_released?: boolean
          updated_at?: string
          updated_by?: string | null
          valid_days: number
        }
        Update: {
          close_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          conditions_ar?: string | null
          created_at?: string
          created_by?: string | null
          deposit_due_millimes?: number
          deposit_paid_at?: string | null
          expires_at?: string | null
          extended_at?: string | null
          extended_count?: number
          id?: string
          note?: string | null
          person_id?: string
          project_id?: string
          reference_no?: string
          request_id?: string | null
          reserved_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          trees_count?: number
          trees_released?: boolean
          updated_at?: string
          updated_by?: string | null
          valid_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservations_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "crm_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "interest_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_updated_by_fkey"
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
          credit_text: string | null
          credit_url: string | null
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
          credit_text?: string | null
          credit_url?: string | null
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
          credit_text?: string | null
          credit_url?: string | null
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
      subscription_lines: {
        Row: {
          amount_millimes: number
          basis: string
          created_at: string
          created_by: string | null
          frequency_label: string | null
          id: string
          in_package: boolean
          label_ar: string
          note: string | null
          provider_label: string | null
          service_option_id: string
          status: string
          subscription_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_millimes?: number
          basis: string
          created_at?: string
          created_by?: string | null
          frequency_label?: string | null
          id?: string
          in_package?: boolean
          label_ar: string
          note?: string | null
          provider_label?: string | null
          service_option_id: string
          status?: string
          subscription_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_millimes?: number
          basis?: string
          created_at?: string
          created_by?: string | null
          frequency_label?: string | null
          id?: string
          in_package?: boolean
          label_ar?: string
          note?: string | null
          provider_label?: string | null
          service_option_id?: string
          status?: string
          subscription_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_lines_service_option_id_fkey"
            columns: ["service_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_lines_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_lines_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          created_by: string | null
          fee_per_tree_millimes: number
          fee_source: string
          id: string
          note: string | null
          payment_status: string
          person_id: string
          project_id: string
          season_ends_on: string
          season_label: string
          season_starts_on: string
          status: string
          total_millimes: number | null
          tree_count: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fee_per_tree_millimes: number
          fee_source: string
          id?: string
          note?: string | null
          payment_status?: string
          person_id: string
          project_id: string
          season_ends_on: string
          season_label: string
          season_starts_on: string
          status?: string
          total_millimes?: number | null
          tree_count: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fee_per_tree_millimes?: number
          fee_source?: string
          id?: string
          note?: string | null
          payment_status?: string
          person_id?: string
          project_id?: string
          season_ends_on?: string
          season_label?: string
          season_starts_on?: string
          status?: string
          total_millimes?: number | null
          tree_count?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_cost_items: {
        Row: {
          amount_millimes: number
          basis: string
          id: string
          is_active: boolean
          label_ar: string
          label_fr: string | null
          project_id: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_millimes: number
          basis: string
          id?: string
          is_active?: boolean
          label_ar: string
          label_fr?: string | null
          project_id?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_millimes?: number
          basis?: string
          id?: string
          is_active?: boolean
          label_ar?: string
          label_fr?: string | null
          project_id?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tree_cost_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_cost_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_pricing_rules: {
        Row: {
          annual_fee_per_tree_millimes: number | null
          id: string
          land_price_per_m2_millimes: number | null
          margin_fixed_millimes: number | null
          margin_mode: string | null
          margin_percent_bp: number | null
          markups_note_ar: string | null
          monthly_rounding_millimes: number | null
          note_ar: string | null
          planting_cost_per_tree_millimes: number | null
          price_rounding_millimes: number | null
          project_id: string | null
          updated_at: string
          updated_by: string | null
          use_global_cost_items: boolean
        }
        Insert: {
          annual_fee_per_tree_millimes?: number | null
          id?: string
          land_price_per_m2_millimes?: number | null
          margin_fixed_millimes?: number | null
          margin_mode?: string | null
          margin_percent_bp?: number | null
          markups_note_ar?: string | null
          monthly_rounding_millimes?: number | null
          note_ar?: string | null
          planting_cost_per_tree_millimes?: number | null
          price_rounding_millimes?: number | null
          project_id?: string | null
          updated_at?: string
          updated_by?: string | null
          use_global_cost_items?: boolean
        }
        Update: {
          annual_fee_per_tree_millimes?: number | null
          id?: string
          land_price_per_m2_millimes?: number | null
          margin_fixed_millimes?: number | null
          margin_mode?: string | null
          margin_percent_bp?: number | null
          markups_note_ar?: string | null
          monthly_rounding_millimes?: number | null
          note_ar?: string | null
          planting_cost_per_tree_millimes?: number | null
          price_rounding_millimes?: number | null
          project_id?: string | null
          updated_at?: string
          updated_by?: string | null
          use_global_cost_items?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tree_pricing_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_pricing_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_spacing_classes: {
        Row: {
          area_m2: number | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          label_ar: string
          label_fr: string | null
          row_spacing_m: number
          sort_order: number
          tree_spacing_m: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area_m2?: number | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label_ar: string
          label_fr?: string | null
          row_spacing_m: number
          sort_order?: number
          tree_spacing_m: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area_m2?: number | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label_ar?: string
          label_fr?: string | null
          row_spacing_m?: number
          sort_order?: number
          tree_spacing_m?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tree_spacing_classes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trees: {
        Row: {
          allocated_at: string | null
          code: string
          created_at: string
          held_by: string | null
          id: string
          note: string | null
          project_id: string
          request_id: string | null
          reservation_id: string | null
          seq: number
          state: Database["public"]["Enums"]["tree_state"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allocated_at?: string | null
          code: string
          created_at?: string
          held_by?: string | null
          id?: string
          note?: string | null
          project_id: string
          request_id?: string | null
          reservation_id?: string | null
          seq: number
          state?: Database["public"]["Enums"]["tree_state"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allocated_at?: string | null
          code?: string
          created_at?: string
          held_by?: string | null
          id?: string
          note?: string | null
          project_id?: string
          request_id?: string | null
          reservation_id?: string | null
          seq?: number
          state?: Database["public"]["Enums"]["tree_state"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trees_held_by_fkey"
            columns: ["held_by"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trees_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trees_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "crm_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trees_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "interest_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trees_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trees_updated_by_fkey"
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
      visits: {
        Row: {
          assigned_to: string | null
          cancel_reason: string | null
          client_note: string | null
          contact_channel: Database["public"]["Enums"]["contact_channel"]
          created_at: string
          created_by: string | null
          id: string
          meeting_point: string | null
          outcome_liked: boolean | null
          outcome_next_step: string | null
          outcome_note: string | null
          outcome_project_id: string | null
          people_count: number
          person_id: string
          project_id: string
          request_id: string | null
          slot_from: string | null
          slot_label_ar: string
          slot_option_id: string | null
          slot_to: string | null
          source: string
          staff_note: string | null
          status: Database["public"]["Enums"]["visit_status"]
          status_changed_at: string
          status_changed_by: string | null
          updated_at: string
          updated_by: string | null
          visit_date: string
          visit_no: string
        }
        Insert: {
          assigned_to?: string | null
          cancel_reason?: string | null
          client_note?: string | null
          contact_channel: Database["public"]["Enums"]["contact_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_point?: string | null
          outcome_liked?: boolean | null
          outcome_next_step?: string | null
          outcome_note?: string | null
          outcome_project_id?: string | null
          people_count: number
          person_id: string
          project_id: string
          request_id?: string | null
          slot_from?: string | null
          slot_label_ar: string
          slot_option_id?: string | null
          slot_to?: string | null
          source?: string
          staff_note?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          status_changed_at?: string
          status_changed_by?: string | null
          updated_at?: string
          updated_by?: string | null
          visit_date: string
          visit_no: string
        }
        Update: {
          assigned_to?: string | null
          cancel_reason?: string | null
          client_note?: string | null
          contact_channel?: Database["public"]["Enums"]["contact_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_point?: string | null
          outcome_liked?: boolean | null
          outcome_next_step?: string | null
          outcome_note?: string | null
          outcome_project_id?: string | null
          people_count?: number
          person_id?: string
          project_id?: string
          request_id?: string | null
          slot_from?: string | null
          slot_label_ar?: string
          slot_option_id?: string | null
          slot_to?: string | null
          source?: string
          staff_note?: string | null
          status?: Database["public"]["Enums"]["visit_status"]
          status_changed_at?: string
          status_changed_by?: string | null
          updated_at?: string
          updated_by?: string | null
          visit_date?: string
          visit_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_outcome_project_id_fkey"
            columns: ["outcome_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "crm_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "interest_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_slot_option_id_fkey"
            columns: ["slot_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_updated_by_fkey"
            columns: ["updated_by"]
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
          area_per_tree_m2: number | null
          assigned_to: string | null
          assigned_to_name: string | null
          budget_label_ar: string | null
          budget_max_millimes: number | null
          budget_min_millimes: number | null
          budget_option_id: string | null
          consent_text: string | null
          contact_channel: Database["public"]["Enums"]["contact_channel"] | null
          contact_time_label_ar: string | null
          contact_time_option_id: string | null
          created_at: string | null
          desired_area_label_ar: string | null
          desired_area_max_m2: number | null
          desired_area_min_m2: number | null
          desired_area_option_id: string | null
          down_payment_amount_millimes: number | null
          down_payment_label_ar: string | null
          down_payment_max_millimes: number | null
          down_payment_min_millimes: number | null
          down_payment_option_id: string | null
          down_payment_percent: number | null
          down_payment_percent_option_id: string | null
          duration_label_ar: string | null
          duration_months: number | null
          duration_option_id: string | null
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
          monthly_millimes: number | null
          offer_annual_fee_per_tree_millimes: number | null
          offer_annual_fee_total_millimes: number | null
          offer_price_per_tree_millimes: number | null
          offer_total_price_millimes: number | null
          offer_trees: number | null
          parcel_area_m2: number | null
          parcel_captured_at: string | null
          parcel_cash_price_millimes: number | null
          parcel_code: string | null
          parcel_id: string | null
          parcel_olive_tree_count: number | null
          parcel_plan_last_millimes: number | null
          parcel_plan_months: number | null
          parcel_plan_total_millimes: number | null
          parcel_plantation_system: string | null
          parcel_production_status: string | null
          parcel_property_type: string | null
          payment_mode: string | null
          person_archived_at: string | null
          person_id: string | null
          phone_e164: string | null
          plantation_systems: string[] | null
          price_per_tree_millimes: number | null
          priority_code: string | null
          priority_label_ar: string | null
          priority_option_id: string | null
          production_statuses: string[] | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          project_type_ids: string[] | null
          project_type_unsure: boolean | null
          request_kind: string | null
          request_no: string | null
          residence_delegation_id: number | null
          residence_governorate_id: number | null
          scenario_ids: string[] | null
          scenario_labels: string[] | null
          source: Json | null
          spacing_class_id: string | null
          spacing_label_ar: string | null
          stage: Database["public"]["Enums"]["lead_stage"] | null
          status_id: string | null
          status_label_ar: string | null
          total_area_m2: number | null
          total_financed_millimes: number | null
          total_price_millimes: number | null
          tree_count_code: string | null
          tree_count_label_ar: string | null
          tree_count_max: number | null
          tree_count_min: number | null
          tree_count_option_id: string | null
          wants_bank_financing: boolean | null
          wants_visit: boolean | null
          whatsapp_e164: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interest_requests_budget_option_id_fkey"
            columns: ["budget_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "interest_requests_down_payment_percent_option_id_fkey"
            columns: ["down_payment_percent_option_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_requests_duration_option_id_fkey"
            columns: ["duration_option_id"]
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
            foreignKeyName: "interest_requests_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: false
            referencedRelation: "parcels"
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
            foreignKeyName: "interest_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
            foreignKeyName: "interest_requests_spacing_class_id_fkey"
            columns: ["spacing_class_id"]
            isOneToOne: false
            referencedRelation: "tree_spacing_classes"
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
      admin_funnel_stats: { Args: never; Returns: Json }
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
      assistant_begin_turn: {
        Args: { p_ip_hash: string; p_question: string }
        Returns: string
      }
      assistant_finish_turn: {
        Args: {
          p_answer: string
          p_error?: string
          p_id: string
          p_model: string
          p_tokens_in: number
          p_tokens_out: number
        }
        Returns: undefined
      }
      claim_notifications: {
        Args: { p_limit?: number }
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
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
        Args: { p_from?: string; p_people?: boolean; p_to?: string }
        Returns: Json
      }
      crm_list_people: {
        Args: { p?: Json; p_limit?: number; p_offset?: number }
        Returns: {
          assigned_to: string
          assigned_to_name: string
          cin: string
          created_at: string
          full_name: string
          governorate_name_ar: string
          last_activity_at: string
          offer_trees: number
          person_id: string
          persons_total: number
          phone_e164: string
          project_id: string
          project_name: string
          request_kind: string
          requests_count: number
          seen_at: string
          stage: Database["public"]["Enums"]["lead_stage"]
          status_id: string
          status_label_ar: string
          tree_count_label_ar: string
        }[]
      }
      crm_people_counts: { Args: never; Returns: Json }
      crm_search_requests: {
        Args: { p: Json; p_limit?: number; p_offset?: number }
        Returns: {
          area_per_tree_m2: number
          assigned_to: string
          assigned_to_name: string
          budget_label_ar: string
          budget_min_millimes: number
          contact_channel: Database["public"]["Enums"]["contact_channel"]
          contact_time_label_ar: string
          created_at: string
          desired_area_label_ar: string
          desired_area_max_m2: number
          desired_area_min_m2: number
          down_payment_amount_millimes: number
          down_payment_label_ar: string
          down_payment_min_millimes: number
          down_payment_percent: number
          duration_label_ar: string
          duration_months: number
          full_name: string
          goal_code: string
          goal_label_ar: string
          id: string
          installment_label_ar: string
          installment_min_millimes: number
          invest_anywhere: boolean
          invest_governorate_ids: number[]
          is_duplicate: boolean
          monthly_millimes: number
          offer_trees: number
          payment_mode: string
          person_id: string
          persons_total: number
          phone_e164: string
          plantation_systems: string[]
          priority_code: string
          priority_label_ar: string
          production_statuses: string[]
          project_code: string
          project_id: string
          project_name: string
          project_type_ids: string[]
          project_type_unsure: boolean
          request_kind: string
          request_no: string
          requests_total: number
          residence_delegation_id: number
          residence_governorate_id: number
          scenario_labels: string[]
          source: Json
          spacing_class_id: string
          spacing_label_ar: string
          stage: Database["public"]["Enums"]["lead_stage"]
          status_id: string
          status_label_ar: string
          total_area_m2: number
          total_count: number
          total_financed_millimes: number
          total_price_millimes: number
          tree_count_code: string
          tree_count_label_ar: string
          tree_count_max: number
          tree_count_min: number
          trees_total: number
          wants_bank_financing: boolean
          wants_visit: boolean
        }[]
      }
      demand_indicator: { Args: { p_governorate: number }; Returns: Json }
      link_client_profile: {
        Args: { p_person: string; p_user: string }
        Returns: Json
      }
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
      mark_notification_failed: {
        Args: { p_error: string; p_id: string; p_provider?: string }
        Returns: undefined
      }
      mark_notification_sent: {
        Args: {
          p_id: string
          p_provider: string
          p_provider_message_id?: string
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
      public_coverage: {
        Args: never
        Returns: {
          governorate_id: number
          parcels_offered: number
          parcels_total: number
          projects_count: number
        }[]
      }
      public_offer_stock: { Args: { p_project: string }; Returns: Json }
      public_parcel_offer: {
        Args: {
          p_down_option?: string
          p_installment_option?: string
          p_parcel: string
        }
        Returns: Json
      }
      public_parcels: {
        Args: never
        Returns: {
          annual_costs_millimes: number
          area_m2: number
          area_per_tree_m2: number
          cash_price_millimes: number
          code: string
          delegation_id: number
          down_from_millimes: number
          governorate_id: number
          id: string
          irrigation: Database["public"]["Enums"]["irrigation_type"]
          offered: boolean
          olive_tree_count: number
          on_tree_pricing: boolean
          photo_alt_ar: string
          photo_aspect: string
          photo_url: string
          plantation_system: string
          price_per_tree_millimes: number
          production_status: string
          project_code: string
          project_id: string
          project_name: string
          project_status: Database["public"]["Enums"]["project_status"]
          project_type_id: string
          property_type: string
          sort_order: number
          spacing_class_id: string
          spacing_label_ar: string
          status: Database["public"]["Enums"]["parcel_status"]
          tree_age_years: number
        }[]
      }
      public_project_page: { Args: { p_code: string }; Returns: Json }
      public_project_quote: {
        Args: {
          p_down_percent_option_id?: string
          p_duration_option_id?: string
          p_payment_mode?: string
          p_project: string
          p_spacing_class?: string
          p_trees?: number
        }
        Returns: Json
      }
      public_projects: {
        Args: never
        Returns: {
          area_per_tree_max_m2: number
          area_per_tree_min_m2: number
          code: string
          cover_alt_ar: string
          cover_aspect: string
          cover_url: string
          delegation_id: number
          governorate_id: number
          id: string
          irrigation: Database["public"]["Enums"]["irrigation_type"]
          location_description: string
          max_area_m2: number
          min_area_m2: number
          min_cash_price_millimes: number
          min_price_per_tree_millimes: number
          name: string
          offered: boolean
          olive_variety: string
          on_tree_pricing: boolean
          parcel_trees: number
          parcels_offered: number
          parcels_total: number
          plantation_system: string
          production_status: string
          project_type_id: string
          status: Database["public"]["Enums"]["project_status"]
          total_area_m2: number
          tree_age_years: number
          tree_count: number
        }[]
      }
      public_tree_quote: {
        Args: {
          p_down_percent_option_id?: string
          p_duration_option_id?: string
          p_payment_mode?: string
          p_spacing_class: string
          p_trees?: number
        }
        Returns: Json
      }
      release_stuck_notifications: { Args: never; Returns: number }
      request_client_login_code: { Args: { p_phone: string }; Returns: Json }
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
      staff_agri_operations: {
        Args: { p_filter?: string; p_limit?: number; p_project?: string }
        Returns: Json
      }
      staff_allocate_trees: {
        Args: {
          p_person: string
          p_project: string
          p_reason: string
          p_request: string
          p_state: string
          p_trees: number
        }
        Returns: Json
      }
      staff_approve_agri_operation: {
        Args: { p_id: string; p_reason: string }
        Returns: Json
      }
      staff_archive_partner: {
        Args: { p_active: boolean; p_partner: string; p_reason: string }
        Returns: Json
      }
      staff_book_closing: { Args: { p: Json; p_reason: string }; Returns: Json }
      staff_book_visit: { Args: { p: Json; p_reason?: string }; Returns: Json }
      staff_callbacks: { Args: { p?: Json }; Returns: Json }
      staff_cancel_contract: {
        Args: { p_contract: string; p_reason: string; p_release: boolean }
        Returns: Json
      }
      staff_close_appointment: {
        Args: { p_appointment: string; p_reason: string; p_status: string }
        Returns: Json
      }
      staff_close_reservation: {
        Args: {
          p_outcome: string
          p_reason: string
          p_release: boolean
          p_reservation: string
        }
        Returns: Json
      }
      staff_contract: { Args: { p_contract: string }; Returns: Json }
      staff_contracts: {
        Args: { p_filter?: string; p_limit?: number; p_project?: string }
        Returns: Json
      }
      staff_create_contract: {
        Args: {
          p_down_payment_millimes: number
          p_duration_months: number
          p_kind: string
          p_method: string
          p_note: string
          p_payment_mode: string
          p_reason: string
          p_reservation: string
        }
        Returns: Json
      }
      staff_create_person: {
        Args: {
          p_email?: string
          p_full_name: string
          p_governorate_id?: number
          p_phone: string
        }
        Returns: Json
      }
      staff_create_reservation: {
        Args: {
          p_from_seq?: number
          p_note: string
          p_person: string
          p_project: string
          p_reason: string
          p_request: string
          p_seqs?: number[]
          p_to_seq?: number
          p_trees: number
        }
        Returns: Json
      }
      staff_create_subscription: {
        Args: { p: Json; p_reason: string }
        Returns: Json
      }
      staff_customer_journey: {
        Args: { p_person: string; p_timeline_limit?: number }
        Returns: Json
      }
      staff_delete_cost_item: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      staff_delete_offer_service: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      staff_delete_pricing_rule: {
        Args: { p_project: string; p_reason: string }
        Returns: undefined
      }
      staff_delete_spacing_class: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      staff_extend_reservation: {
        Args: { p_days: number; p_reason: string; p_reservation: string }
        Returns: Json
      }
      staff_generate_schedule: {
        Args: { p_contract: string; p_reason: string }
        Returns: Json
      }
      staff_generate_trees: {
        Args: { p_project: string; p_reason: string }
        Returns: Json
      }
      staff_harvest_overview: { Args: { p_project?: string }; Returns: Json }
      staff_harvest_season: { Args: { p_season: string }; Returns: Json }
      staff_installments: {
        Args: { p_filter?: string; p_limit?: number }
        Returns: Json
      }
      staff_journey_spine: { Args: never; Returns: Json }
      staff_legal_checklist_template: {
        Args: { p_include_inactive?: boolean }
        Returns: Json
      }
      staff_legal_file: { Args: { p_reservation: string }; Returns: Json }
      staff_legal_queue: {
        Args: { p_filter?: string; p_limit?: number; p_project?: string }
        Returns: Json
      }
      staff_legal_sync_items: {
        Args: { p_file: string; p_reason: string }
        Returns: Json
      }
      staff_mark_person_seen: { Args: { p_person: string }; Returns: undefined }
      staff_match_offers: {
        Args: { p_limit?: number; p_request: string }
        Returns: Json
      }
      staff_offer_services: { Args: { p_project: string }; Returns: Json }
      staff_offer_stock: { Args: { p_project: string }; Returns: Json }
      staff_offer_tree_runs: {
        Args: { p_limit?: number; p_project: string }
        Returns: {
          from_code: string
          from_seq: number
          to_code: string
          to_seq: number
          trees: number
        }[]
      }
      staff_open_legal_file: {
        Args: { p_note: string; p_reason: string; p_reservation: string }
        Returns: Json
      }
      staff_parcel_offer: {
        Args: {
          p_down_option?: string
          p_installment_option?: string
          p_parcel: string
        }
        Returns: Json
      }
      staff_partners: {
        Args: {
          p_governorate?: number
          p_include_archived?: boolean
          p_search?: string
          p_speciality?: string
        }
        Returns: Json
      }
      staff_person_contracts: { Args: { p_person: string }; Returns: Json }
      staff_person_reservations: { Args: { p_person: string }; Returns: Json }
      staff_person_stage: { Args: { p_person_ids: string[] }; Returns: Json }
      staff_person_visits: { Args: { p_person: string }; Returns: Json }
      staff_project_parcel_prices: {
        Args: { p_project: string }
        Returns: {
          parcel_id: string
          price: Json
        }[]
      }
      staff_project_quote: {
        Args: {
          p_down_percent_option_id?: string
          p_duration_option_id?: string
          p_payment_mode?: string
          p_project: string
          p_spacing_class?: string
          p_trees?: number
        }
        Returns: Json
      }
      staff_record_deposit: {
        Args: {
          p_amount_millimes: number
          p_method: string
          p_note: string
          p_reason: string
          p_received_at: string
          p_reference: string
          p_reservation: string
        }
        Returns: Json
      }
      staff_record_installment: {
        Args: {
          p_amount_millimes: number
          p_contract: string
          p_installment: string
          p_kind: string
          p_method: string
          p_note: string
          p_reason: string
          p_received_at: string
          p_reference: string
        }
        Returns: Json
      }
      staff_request_journey: { Args: { p_request: string }; Returns: Json }
      staff_request_stage: { Args: { p_request_ids: string[] }; Returns: Json }
      staff_request_subscription_service: {
        Args: { p_reason: string; p_service: string; p_subscription: string }
        Returns: Json
      }
      staff_reservation: { Args: { p_reservation: string }; Returns: Json }
      staff_reservation_terms: { Args: { p_project: string }; Returns: Json }
      staff_reservations: {
        Args: { p_filter?: string; p_limit?: number; p_project?: string }
        Returns: Json
      }
      staff_save_agri_operation: {
        Args: { p: Json; p_reason: string }
        Returns: Json
      }
      staff_save_checklist_item: {
        Args: { p: Json; p_reason: string }
        Returns: Json
      }
      staff_save_cost_item: {
        Args: { p: Json; p_reason: string }
        Returns: string
      }
      staff_save_financing_markups: {
        Args: { p_project: string; p_reason: string; p_rows: Json }
        Returns: undefined
      }
      staff_save_harvest_season: {
        Args: { p: Json; p_reason: string }
        Returns: Json
      }
      staff_save_offer_harvest_options: {
        Args: {
          p_outcome_default: string
          p_outcome_ids: string[]
          p_pick_default: string
          p_pick_ids: string[]
          p_project: string
          p_reason: string
        }
        Returns: Json
      }
      staff_save_offer_service: {
        Args: { p: Json; p_reason: string }
        Returns: Json
      }
      staff_save_partner: { Args: { p: Json; p_reason: string }; Returns: Json }
      staff_save_pricing_rule: {
        Args: { p: Json; p_project: string; p_reason: string }
        Returns: undefined
      }
      staff_save_project_down_percents: {
        Args: {
          p_option_item_ids: string[]
          p_project: string
          p_reason: string
        }
        Returns: undefined
      }
      staff_save_project_spacing_classes: {
        Args: { p_class_ids: string[]; p_project: string; p_reason: string }
        Returns: undefined
      }
      staff_save_spacing_class: {
        Args: { p: Json; p_reason: string }
        Returns: string
      }
      staff_set_contract_owned: {
        Args: { p_contract: string; p_owned_on: string; p_reason: string }
        Returns: Json
      }
      staff_set_harvest_choice: {
        Args: {
          p_note: string
          p_outcome_option_id: string
          p_person: string
          p_pick_option_id: string
          p_reason: string
          p_season: string
        }
        Returns: Json
      }
      staff_set_harvest_money: {
        Args: {
          p_harvest_cost_millimes: number
          p_reason: string
          p_sale_amount_millimes: number
          p_season: string
        }
        Returns: Json
      }
      staff_set_harvest_status: {
        Args: { p_reason: string; p_season: string; p_status: string }
        Returns: Json
      }
      staff_set_legal_check: {
        Args: {
          p_check: string
          p_done: boolean
          p_note: string
          p_reason: string
        }
        Returns: Json
      }
      staff_set_legal_note: {
        Args: { p_file: string; p_note: string; p_reason: string }
        Returns: Json
      }
      staff_set_subscription_status: {
        Args: {
          p_id: string
          p_payment: string
          p_reason: string
          p_status: string
        }
        Returns: Json
      }
      staff_set_tree_state: {
        Args: { p_reason: string; p_state: string; p_tree_ids: string[] }
        Returns: Json
      }
      staff_set_visit_status: {
        Args: { p?: Json; p_reason?: string; p_status: string; p_visit: string }
        Returns: Json
      }
      staff_settle_harvest_season: {
        Args: { p_reason: string; p_season: string }
        Returns: Json
      }
      staff_sign_contract: {
        Args: {
          p_contract: string
          p_first_due_on: string
          p_legal_ref: string
          p_reason: string
          p_signed_on: string
        }
        Returns: Json
      }
      staff_subscription_preview: {
        Args: { p_person: string; p_project: string }
        Returns: Json
      }
      staff_subscriptions: {
        Args: { p_filter?: string; p_limit?: number; p_project?: string }
        Returns: Json
      }
      staff_tree_quote: {
        Args: {
          p_down_percent?: number
          p_months?: number
          p_project?: string
          p_spacing_class: string
          p_trees?: number
        }
        Returns: Json
      }
      staff_update_installment: {
        Args: {
          p_amount_millimes: number
          p_due_on: string
          p_installment: string
          p_note: string
          p_reason: string
        }
        Returns: Json
      }
      staff_update_visit: {
        Args: { p: Json; p_reason?: string; p_visit: string }
        Returns: Json
      }
      staff_visit_board: { Args: { p?: Json }; Returns: Json }
      staff_void_payment: {
        Args: { p_payment: string; p_reason: string }
        Returns: Json
      }
      staff_waive_legal_check: {
        Args: { p_check: string; p_reason: string }
        Returns: Json
      }
      staff_zitounti_file: { Args: { p_person_id: string }; Returns: Json }
      staff_zitounti_holders: { Args: never; Returns: Json }
      submit_interest_request: { Args: { p: Json }; Returns: Json }
      submit_land_offer: { Args: { p: Json }; Returns: Json }
      submit_offer_request: { Args: { p: Json }; Returns: Json }
      submit_visit_request: { Args: { p: Json }; Returns: Json }
      verify_client_login_code: {
        Args: { p_code: string; p_phone: string }
        Returns: Json
      }
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
      contract_status: "draft" | "signed" | "completed" | "cancelled"
      flag_state: "disabled" | "internal" | "public"
      harvest_choice_source: "client" | "staff" | "auto"
      harvest_season_status:
        | "planned"
        | "harvesting"
        | "closed"
        | "settled"
        | "cancelled"
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
      legal_appointment_status: "scheduled" | "completed" | "cancelled"
      legal_gate: "contract" | "signature" | "ownership"
      notification_status: "pending" | "sending" | "sent" | "failed" | "skipped"
      parcel_status:
        | "available"
        | "interested"
        | "reserved"
        | "contracting"
        | "sold"
        | "owned"
        | "withdrawn"
      payment_kind: "deposit" | "down_payment" | "installment" | "other"
      project_status:
        | "draft"
        | "preparing"
        | "internal"
        | "published"
        | "sold_out"
        | "operating"
        | "archived"
      reservation_status:
        | "awaiting_deposit"
        | "deposit_paid"
        | "expired"
        | "cancelled"
        | "converted"
      tree_state: "available" | "reserved" | "sold"
      visit_status:
        | "requested"
        | "confirmed"
        | "completed"
        | "no_show"
        | "cancelled"
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
      contract_status: ["draft", "signed", "completed", "cancelled"],
      flag_state: ["disabled", "internal", "public"],
      harvest_choice_source: ["client", "staff", "auto"],
      harvest_season_status: [
        "planned",
        "harvesting",
        "closed",
        "settled",
        "cancelled",
      ],
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
      legal_appointment_status: ["scheduled", "completed", "cancelled"],
      legal_gate: ["contract", "signature", "ownership"],
      notification_status: ["pending", "sending", "sent", "failed", "skipped"],
      parcel_status: [
        "available",
        "interested",
        "reserved",
        "contracting",
        "sold",
        "owned",
        "withdrawn",
      ],
      payment_kind: ["deposit", "down_payment", "installment", "other"],
      project_status: [
        "draft",
        "preparing",
        "internal",
        "published",
        "sold_out",
        "operating",
        "archived",
      ],
      reservation_status: [
        "awaiting_deposit",
        "deposit_paid",
        "expired",
        "cancelled",
        "converted",
      ],
      tree_state: ["available", "reserved", "sold"],
      visit_status: [
        "requested",
        "confirmed",
        "completed",
        "no_show",
        "cancelled",
      ],
    },
  },
} as const
