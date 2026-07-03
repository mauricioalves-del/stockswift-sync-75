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
      app_config: {
        Row: {
          chave: string
          updated_at: string
          updated_by: string | null
          valor: Json
        }
        Insert: {
          chave: string
          updated_at?: string
          updated_by?: string | null
          valor: Json
        }
        Update: {
          chave?: string
          updated_at?: string
          updated_by?: string | null
          valor?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          acao: string
          created_at: string
          entidade: string | null
          entidade_id: string | null
          id: string
          payload: Json | null
          usuario: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          payload?: Json | null
          usuario?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          entidade?: string | null
          entidade_id?: string | null
          id?: string
          payload?: Json | null
          usuario?: string | null
        }
        Relationships: []
      }
      baixa_operacional: {
        Row: {
          aprovador_id: string | null
          codigo_produto: string
          comentario_aprovacao: string | null
          created_at: string
          custo_unitario: number
          data_aprovacao: string | null
          data_execucao: string | null
          data_solicitacao: string
          descricao: string
          foto_url: string | null
          id: string
          id_local: string | null
          lote: string | null
          motivo_baixa_id: string | null
          observacao: string | null
          origem: string | null
          quantidade: number
          solicitante_id: string
          status_fluxo: string
          unidade: string | null
          updated_at: string
          valor_total: number
        }
        Insert: {
          aprovador_id?: string | null
          codigo_produto: string
          comentario_aprovacao?: string | null
          created_at?: string
          custo_unitario?: number
          data_aprovacao?: string | null
          data_execucao?: string | null
          data_solicitacao?: string
          descricao: string
          foto_url?: string | null
          id?: string
          id_local?: string | null
          lote?: string | null
          motivo_baixa_id?: string | null
          observacao?: string | null
          origem?: string | null
          quantidade: number
          solicitante_id?: string
          status_fluxo?: string
          unidade?: string | null
          updated_at?: string
          valor_total?: number
        }
        Update: {
          aprovador_id?: string | null
          codigo_produto?: string
          comentario_aprovacao?: string | null
          created_at?: string
          custo_unitario?: number
          data_aprovacao?: string | null
          data_execucao?: string | null
          data_solicitacao?: string
          descricao?: string
          foto_url?: string | null
          id?: string
          id_local?: string | null
          lote?: string | null
          motivo_baixa_id?: string | null
          observacao?: string | null
          origem?: string | null
          quantidade?: number
          solicitante_id?: string
          status_fluxo?: string
          unidade?: string | null
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "baixa_operacional_motivo_baixa_id_fkey"
            columns: ["motivo_baixa_id"]
            isOneToOne: false
            referencedRelation: "motivo_baixa"
            referencedColumns: ["id"]
          },
        ]
      }
      classificacao_abc: {
        Row: {
          classe: string
          codigo_produto: string
          created_at: string
          proxima_contagem: string | null
          ultima_contagem: string | null
          updated_at: string
        }
        Insert: {
          classe: string
          codigo_produto: string
          created_at?: string
          proxima_contagem?: string | null
          ultima_contagem?: string | null
          updated_at?: string
        }
        Update: {
          classe?: string
          codigo_produto?: string
          created_at?: string
          proxima_contagem?: string | null
          ultima_contagem?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      demanda_extra: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string
          data_fim: string
          data_inicio: string
          familia: string | null
          grupo_produto: string | null
          id: string
          motivo: string
          observacao: string | null
          origem: string
          produto: string
          quantidade_extra: number
          responsavel: string | null
          sku: string
          status: string
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          data_fim?: string
          data_inicio?: string
          familia?: string | null
          grupo_produto?: string | null
          id?: string
          motivo?: string
          observacao?: string | null
          origem: string
          produto?: string
          quantidade_extra?: number
          responsavel?: string | null
          sku: string
          status?: string
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          data_fim?: string
          data_inicio?: string
          familia?: string | null
          grupo_produto?: string | null
          id?: string
          motivo?: string
          observacao?: string | null
          origem?: string
          produto?: string
          quantidade_extra?: number
          responsavel?: string | null
          sku?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      estoque_sistemico: {
        Row: {
          cliente: string
          custo_unitario: number
          data_importacao: string
          data_validade: string | null
          descricao: string
          ean: string | null
          id: string
          id_local: string
          id_produto: string
          importado_por: string | null
          lote: string
          origem: string
          quantidade: number
          unidade: string
        }
        Insert: {
          cliente?: string
          custo_unitario?: number
          data_importacao?: string
          data_validade?: string | null
          descricao?: string
          ean?: string | null
          id?: string
          id_local?: string
          id_produto: string
          importado_por?: string | null
          lote?: string
          origem?: string
          quantidade?: number
          unidade?: string
        }
        Update: {
          cliente?: string
          custo_unitario?: number
          data_importacao?: string
          data_validade?: string | null
          descricao?: string
          ean?: string | null
          id?: string
          id_local?: string
          id_produto?: string
          importado_por?: string | null
          lote?: string
          origem?: string
          quantidade?: number
          unidade?: string
        }
        Relationships: []
      }
      familias: {
        Row: {
          codigo_produto: string
          created_at: string
          descricao_produto: string | null
          familia: string
          id: string
          updated_at: string
        }
        Insert: {
          codigo_produto: string
          created_at?: string
          descricao_produto?: string | null
          familia: string
          id?: string
          updated_at?: string
        }
        Update: {
          codigo_produto?: string
          created_at?: string
          descricao_produto?: string | null
          familia?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      grupo_produtos: {
        Row: {
          codigo_produto: string
          created_at: string
          grupo: string
          id: string
          updated_at: string
        }
        Insert: {
          codigo_produto: string
          created_at?: string
          grupo: string
          id?: string
          updated_at?: string
        }
        Update: {
          codigo_produto?: string
          created_at?: string
          grupo?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      historico_consumo: {
        Row: {
          created_at: string
          data_movimento: string
          descricao: string | null
          id: string
          importado_por: string | null
          origem: string
          quantidade: number
          sku: string
        }
        Insert: {
          created_at?: string
          data_movimento: string
          descricao?: string | null
          id?: string
          importado_por?: string | null
          origem: string
          quantidade?: number
          sku: string
        }
        Update: {
          created_at?: string
          data_movimento?: string
          descricao?: string | null
          id?: string
          importado_por?: string | null
          origem?: string
          quantidade?: number
          sku?: string
        }
        Relationships: []
      }
      importacoes_estoque: {
        Row: {
          arquivo: string
          atualizados: number
          created_at: string
          data_importacao: string
          detalhes: Json | null
          erros: number
          id: string
          novos: number
          registros_processados: number
          usuario: string | null
        }
        Insert: {
          arquivo?: string
          atualizados?: number
          created_at?: string
          data_importacao?: string
          detalhes?: Json | null
          erros?: number
          id?: string
          novos?: number
          registros_processados?: number
          usuario?: string | null
        }
        Update: {
          arquivo?: string
          atualizados?: number
          created_at?: string
          data_importacao?: string
          detalhes?: Json | null
          erros?: number
          id?: string
          novos?: number
          registros_processados?: number
          usuario?: string | null
        }
        Relationships: []
      }
      inventario: {
        Row: {
          acuracidade: number | null
          aprovado_em: string | null
          aprovado_por: string | null
          contagem_numero: number
          custo_unitario: number
          data_contagem: string
          data_validade: string | null
          descricao: string
          divergencia: number | null
          id: string
          id_local: string
          id_produto: string
          lote: string
          observacao: string | null
          origem: string
          quantidade_contada: number
          saldo_sistemico: number
          sincronizado: boolean
          status: string
          unidade: string
          usuario: string | null
          valor_divergencia: number | null
        }
        Insert: {
          acuracidade?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          contagem_numero?: number
          custo_unitario?: number
          data_contagem?: string
          data_validade?: string | null
          descricao?: string
          divergencia?: number | null
          id?: string
          id_local?: string
          id_produto: string
          lote?: string
          observacao?: string | null
          origem?: string
          quantidade_contada?: number
          saldo_sistemico?: number
          sincronizado?: boolean
          status?: string
          unidade?: string
          usuario?: string | null
          valor_divergencia?: number | null
        }
        Update: {
          acuracidade?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          contagem_numero?: number
          custo_unitario?: number
          data_contagem?: string
          data_validade?: string | null
          descricao?: string
          divergencia?: number | null
          id?: string
          id_local?: string
          id_produto?: string
          lote?: string
          observacao?: string | null
          origem?: string
          quantidade_contada?: number
          saldo_sistemico?: number
          sincronizado?: boolean
          status?: string
          unidade?: string
          usuario?: string | null
          valor_divergencia?: number | null
        }
        Relationships: []
      }
      locais: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          origem: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          origem?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          origem?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      missoes: {
        Row: {
          created_at: string
          criado_por: string | null
          data_execucao: string | null
          descricao: string | null
          familia: string | null
          grupo: string | null
          id: string
          id_local: string | null
          origem: string | null
          responsavel_id: string | null
          status: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          data_execucao?: string | null
          descricao?: string | null
          familia?: string | null
          grupo?: string | null
          id?: string
          id_local?: string | null
          origem?: string | null
          responsavel_id?: string | null
          status?: string
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          data_execucao?: string | null
          descricao?: string | null
          familia?: string | null
          grupo?: string | null
          id?: string
          id_local?: string | null
          origem?: string | null
          responsavel_id?: string | null
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      missoes_itens: {
        Row: {
          codigo_produto: string
          created_at: string
          descricao: string | null
          id: string
          lote: string | null
          missao_id: string
          quantidade_contada: number | null
          quantidade_prevista: number | null
          status_item: string
          updated_at: string
        }
        Insert: {
          codigo_produto: string
          created_at?: string
          descricao?: string | null
          id?: string
          lote?: string | null
          missao_id: string
          quantidade_contada?: number | null
          quantidade_prevista?: number | null
          status_item?: string
          updated_at?: string
        }
        Update: {
          codigo_produto?: string
          created_at?: string
          descricao?: string | null
          id?: string
          lote?: string | null
          missao_id?: string
          quantidade_contada?: number | null
          quantidade_prevista?: number | null
          status_item?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "missoes_itens_missao_id_fkey"
            columns: ["missao_id"]
            isOneToOne: false
            referencedRelation: "missoes"
            referencedColumns: ["id"]
          },
        ]
      }
      motivo_baixa: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string
          id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao: string
          id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      origens: {
        Row: {
          ativo: boolean
          codigo_origem: string
          created_at: string
          descricao: string
          id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_origem: string
          created_at?: string
          descricao?: string
          id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_origem?: string
          created_at?: string
          descricao?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      parametros_abastecimento: {
        Row: {
          ativo: boolean
          cobertura_dias: number
          created_at: string
          dias_seguranca: number
          frequencia_abastecimento: string
          id: string
          origem: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cobertura_dias?: number
          created_at?: string
          dias_seguranca?: number
          frequencia_abastecimento?: string
          id?: string
          origem: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cobertura_dias?: number
          created_at?: string
          dias_seguranca?: number
          frequencia_abastecimento?: string
          id?: string
          origem?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      recontagem: {
        Row: {
          acuracidade: number | null
          aprovado_em: string | null
          aprovado_por: string | null
          codigo_produto: string
          contagem: number
          created_at: string
          descricao: string
          id: string
          id_local: string
          inventario_id: string | null
          lote: string
          motivo: string | null
          origem: string
          saldo_sistema: number
          status: string
          updated_at: string
          usuario: string | null
        }
        Insert: {
          acuracidade?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          codigo_produto: string
          contagem?: number
          created_at?: string
          descricao?: string
          id?: string
          id_local?: string
          inventario_id?: string | null
          lote?: string
          motivo?: string | null
          origem?: string
          saldo_sistema?: number
          status?: string
          updated_at?: string
          usuario?: string | null
        }
        Update: {
          acuracidade?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          codigo_produto?: string
          contagem?: number
          created_at?: string
          descricao?: string
          id?: string
          id_local?: string
          inventario_id?: string | null
          lote?: string
          motivo?: string | null
          origem?: string
          saldo_sistema?: number
          status?: string
          updated_at?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recontagem_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventario"
            referencedColumns: ["id"]
          },
        ]
      }
      status_baixa: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string
          id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao: string
          id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_gestor: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "ADMINISTRADOR"
        | "INVENTARIANTE"
        | "CONSULTA"
        | "GERENTE"
        | "AUDITOR"
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
    Enums: {
      app_role: [
        "ADMINISTRADOR",
        "INVENTARIANTE",
        "CONSULTA",
        "GERENTE",
        "AUDITOR",
      ],
    },
  },
} as const
