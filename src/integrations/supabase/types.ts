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
      auditoria: {
        Row: {
          acao: string
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          observacao: string | null
          usuario: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          observacao?: string | null
          usuario?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          observacao?: string | null
          usuario?: string | null
        }
        Relationships: []
      }
      baixa_operacional: {
        Row: {
          aprovador_id: string | null
          categoria: string | null
          codigo_produto: string
          comentario_aprovacao: string | null
          created_at: string
          custo_unitario: number
          data_aprovacao: string | null
          data_execucao: string | null
          data_ocorrencia: string | null
          data_solicitacao: string
          descricao: string
          foto_url: string | null
          id: string
          id_local: string | null
          lote: string | null
          motivo_baixa_id: string | null
          observacao: string | null
          origem: string | null
          origem_lancamento: string
          quantidade: number
          responsavel_nome: string | null
          solicitacao_id: number | null
          solicitante_id: string
          status_fluxo: string
          subcategoria: string | null
          unidade: string | null
          updated_at: string
          valor_total: number
        }
        Insert: {
          aprovador_id?: string | null
          categoria?: string | null
          codigo_produto: string
          comentario_aprovacao?: string | null
          created_at?: string
          custo_unitario?: number
          data_aprovacao?: string | null
          data_execucao?: string | null
          data_ocorrencia?: string | null
          data_solicitacao?: string
          descricao: string
          foto_url?: string | null
          id?: string
          id_local?: string | null
          lote?: string | null
          motivo_baixa_id?: string | null
          observacao?: string | null
          origem?: string | null
          origem_lancamento?: string
          quantidade: number
          responsavel_nome?: string | null
          solicitacao_id?: number | null
          solicitante_id?: string
          status_fluxo?: string
          subcategoria?: string | null
          unidade?: string | null
          updated_at?: string
          valor_total?: number
        }
        Update: {
          aprovador_id?: string | null
          categoria?: string | null
          codigo_produto?: string
          comentario_aprovacao?: string | null
          created_at?: string
          custo_unitario?: number
          data_aprovacao?: string | null
          data_execucao?: string | null
          data_ocorrencia?: string | null
          data_solicitacao?: string
          descricao?: string
          foto_url?: string | null
          id?: string
          id_local?: string | null
          lote?: string | null
          motivo_baixa_id?: string | null
          observacao?: string | null
          origem?: string | null
          origem_lancamento?: string
          quantidade?: number
          responsavel_nome?: string | null
          solicitacao_id?: number | null
          solicitante_id?: string
          status_fluxo?: string
          subcategoria?: string | null
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
          {
            foreignKeyName: "baixa_operacional_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_baixa"
            referencedColumns: ["id"]
          },
        ]
      }
      cadastro_emails: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          finalidade: string
          id: string
          nome_contato: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          finalidade: string
          id?: string
          nome_contato?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          finalidade?: string
          id?: string
          nome_contato?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      checklist_execucao: {
        Row: {
          created_at: string
          id: string
          item_id: string
          marcado: boolean
          marcado_em: string | null
          marcado_por: string | null
          observacao: string | null
          tarefa_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          marcado?: boolean
          marcado_em?: string | null
          marcado_por?: string | null
          observacao?: string | null
          tarefa_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          marcado?: boolean
          marcado_em?: string | null
          marcado_por?: string | null
          observacao?: string | null
          tarefa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_execucao_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "modelos_checklist_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execucao_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas_operacionais"
            referencedColumns: ["id"]
          },
        ]
      }
      classificacao_abc: {
        Row: {
          calculado_em: string | null
          classe: string
          codigo_produto: string
          created_at: string
          percentual_acumulado: number | null
          periodo_dias: number | null
          proxima_contagem: string | null
          ultima_contagem: string | null
          updated_at: string
          valor_movimentado: number
        }
        Insert: {
          calculado_em?: string | null
          classe: string
          codigo_produto: string
          created_at?: string
          percentual_acumulado?: number | null
          periodo_dias?: number | null
          proxima_contagem?: string | null
          ultima_contagem?: string | null
          updated_at?: string
          valor_movimentado?: number
        }
        Update: {
          calculado_em?: string | null
          classe?: string
          codigo_produto?: string
          created_at?: string
          percentual_acumulado?: number | null
          periodo_dias?: number | null
          proxima_contagem?: string | null
          ultima_contagem?: string | null
          updated_at?: string
          valor_movimentado?: number
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
      dispersao_acoes_corretivas: {
        Row: {
          aberto_por: string | null
          ano_mes: string | null
          created_at: string
          data_abertura: string
          data_conclusao: string | null
          descricao_acao: string
          fechado_por: string | null
          id: string
          material: string | null
          producao_consumo_id: string | null
          responsavel: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aberto_por?: string | null
          ano_mes?: string | null
          created_at?: string
          data_abertura?: string
          data_conclusao?: string | null
          descricao_acao: string
          fechado_por?: string | null
          id?: string
          material?: string | null
          producao_consumo_id?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aberto_por?: string | null
          ano_mes?: string | null
          created_at?: string
          data_abertura?: string
          data_conclusao?: string | null
          descricao_acao?: string
          fechado_por?: string | null
          id?: string
          material?: string | null
          producao_consumo_id?: string | null
          responsavel?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispersao_acoes_corretivas_producao_consumo_id_fkey"
            columns: ["producao_consumo_id"]
            isOneToOne: false
            referencedRelation: "producao_consumo"
            referencedColumns: ["id"]
          },
        ]
      }
      dispersao_causa_raiz: {
        Row: {
          causa: string
          classificado_em: string
          classificado_por: string | null
          created_at: string
          id: string
          observacao: string | null
          producao_consumo_id: string
          updated_at: string
        }
        Insert: {
          causa: string
          classificado_em?: string
          classificado_por?: string | null
          created_at?: string
          id?: string
          observacao?: string | null
          producao_consumo_id: string
          updated_at?: string
        }
        Update: {
          causa?: string
          classificado_em?: string
          classificado_por?: string | null
          created_at?: string
          id?: string
          observacao?: string | null
          producao_consumo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispersao_causa_raiz_producao_consumo_id_fkey"
            columns: ["producao_consumo_id"]
            isOneToOne: false
            referencedRelation: "producao_consumo"
            referencedColumns: ["id"]
          },
        ]
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
      ficha_tecnica_bom: {
        Row: {
          created_at: string
          criado_por: string | null
          custo: number
          gera_oc: boolean
          id: string
          id_item: string
          id_produto: string
          id_subconjunto: string | null
          item: string | null
          item_unidade: string | null
          linha_origem: string | null
          produto: string | null
          qtd: number
          subconjunto: string | null
          tem_filho: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          custo?: number
          gera_oc?: boolean
          id?: string
          id_item: string
          id_produto: string
          id_subconjunto?: string | null
          item?: string | null
          item_unidade?: string | null
          linha_origem?: string | null
          produto?: string | null
          qtd?: number
          subconjunto?: string | null
          tem_filho?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          custo?: number
          gera_oc?: boolean
          id?: string
          id_item?: string
          id_produto?: string
          id_subconjunto?: string | null
          item?: string | null
          item_unidade?: string | null
          linha_origem?: string | null
          produto?: string | null
          qtd?: number
          subconjunto?: string | null
          tem_filho?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      grupo_produtos: {
        Row: {
          codigo_produto: string
          created_at: string
          eh_produto_local: boolean
          grupo: string
          id: string
          updated_at: string
        }
        Insert: {
          codigo_produto: string
          created_at?: string
          eh_produto_local?: boolean
          grupo: string
          id?: string
          updated_at?: string
        }
        Update: {
          codigo_produto?: string
          created_at?: string
          eh_produto_local?: boolean
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
      inventario_arquivado: {
        Row: {
          acuracidade: number | null
          aprovado_em: string | null
          aprovado_por: string | null
          arquivado_em: string
          arquivado_por: string | null
          contagem_numero: number
          custo_unitario: number
          data_contagem: string
          data_validade: string | null
          descricao: string
          divergencia: number | null
          escopo_lote: string | null
          id: string
          id_local: string
          id_produto: string
          inventario_id: string | null
          lote: string
          motivo_arquivamento: string | null
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
          arquivado_em?: string
          arquivado_por?: string | null
          contagem_numero: number
          custo_unitario: number
          data_contagem: string
          data_validade?: string | null
          descricao: string
          divergencia?: number | null
          escopo_lote?: string | null
          id?: string
          id_local: string
          id_produto: string
          inventario_id?: string | null
          lote: string
          motivo_arquivamento?: string | null
          observacao?: string | null
          origem: string
          quantidade_contada: number
          saldo_sistemico: number
          sincronizado?: boolean
          status: string
          unidade: string
          usuario?: string | null
          valor_divergencia?: number | null
        }
        Update: {
          acuracidade?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquivado_em?: string
          arquivado_por?: string | null
          contagem_numero?: number
          custo_unitario?: number
          data_contagem?: string
          data_validade?: string | null
          descricao?: string
          divergencia?: number | null
          escopo_lote?: string | null
          id?: string
          id_local?: string
          id_produto?: string
          inventario_id?: string | null
          lote?: string
          motivo_arquivamento?: string | null
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
      itens_missao_lotes: {
        Row: {
          created_at: string
          data_validade_manual: string | null
          eh_nao_relacionado: boolean
          id: string
          item_missao_id: string
          lote: string | null
          lote_manual_texto: string | null
          quantidade_contada: number
          saldo_sistemico_lote: number | null
          updated_at: string
          usuario: string | null
        }
        Insert: {
          created_at?: string
          data_validade_manual?: string | null
          eh_nao_relacionado?: boolean
          id?: string
          item_missao_id: string
          lote?: string | null
          lote_manual_texto?: string | null
          quantidade_contada?: number
          saldo_sistemico_lote?: number | null
          updated_at?: string
          usuario?: string | null
        }
        Update: {
          created_at?: string
          data_validade_manual?: string | null
          eh_nao_relacionado?: boolean
          id?: string
          item_missao_id?: string
          lote?: string | null
          lote_manual_texto?: string | null
          quantidade_contada?: number
          saldo_sistemico_lote?: number | null
          updated_at?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_missao_lotes_item_missao_id_fkey"
            columns: ["item_missao_id"]
            isOneToOne: false
            referencedRelation: "missoes_itens"
            referencedColumns: ["id"]
          },
        ]
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
          recontagem_origem_id: string | null
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
          recontagem_origem_id?: string | null
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
          recontagem_origem_id?: string | null
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
          {
            foreignKeyName: "missoes_itens_recontagem_origem_id_fkey"
            columns: ["recontagem_origem_id"]
            isOneToOne: false
            referencedRelation: "recontagem"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_checklist: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          tipo_tarefa_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          tipo_tarefa_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          tipo_tarefa_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modelos_checklist_tipo_tarefa_id_fkey"
            columns: ["tipo_tarefa_id"]
            isOneToOne: false
            referencedRelation: "tipos_tarefa"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_checklist_itens: {
        Row: {
          created_at: string
          descricao_item: string
          id: string
          modelo_id: string
          ordem: number
        }
        Insert: {
          created_at?: string
          descricao_item: string
          id?: string
          modelo_id: string
          ordem?: number
        }
        Update: {
          created_at?: string
          descricao_item?: string
          id?: string
          modelo_id?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "modelos_checklist_itens_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_checklist"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos_sistema: {
        Row: {
          chave: string
          created_at: string
          id: string
          modulo_pai_id: string | null
          nome: string
          ordem: number
          rota: string | null
        }
        Insert: {
          chave: string
          created_at?: string
          id?: string
          modulo_pai_id?: string | null
          nome: string
          ordem?: number
          rota?: string | null
        }
        Update: {
          chave?: string
          created_at?: string
          id?: string
          modulo_pai_id?: string | null
          nome?: string
          ordem?: number
          rota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modulos_sistema_modulo_pai_id_fkey"
            columns: ["modulo_pai_id"]
            isOneToOne: false
            referencedRelation: "modulos_sistema"
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
      necessidade_materiais_op: {
        Row: {
          created_at: string
          eh_semiacabado: boolean
          id: string
          id_item: string
          item: string | null
          op_filha_id: string | null
          op_id: string
          qtd_consumo_real: number | null
          qtd_necessaria: number
          saldo_disponivel_no_calculo: number | null
          status_disponibilidade: string | null
          um: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          eh_semiacabado?: boolean
          id?: string
          id_item: string
          item?: string | null
          op_filha_id?: string | null
          op_id: string
          qtd_consumo_real?: number | null
          qtd_necessaria: number
          saldo_disponivel_no_calculo?: number | null
          status_disponibilidade?: string | null
          um?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          eh_semiacabado?: boolean
          id?: string
          id_item?: string
          item?: string | null
          op_filha_id?: string | null
          op_id?: string
          qtd_consumo_real?: number | null
          qtd_necessaria?: number
          saldo_disponivel_no_calculo?: number | null
          status_disponibilidade?: string | null
          um?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "necessidade_materiais_op_op_filha_id_fkey"
            columns: ["op_filha_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "necessidade_materiais_op_op_id_fkey"
            columns: ["op_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_producao: {
        Row: {
          almoxarifado_producao: string | null
          created_at: string
          criado_por: string | null
          data_conclusao_real: string | null
          data_inicio_real: string | null
          data_planejada: string | null
          desc_produto: string | null
          id: string
          numero_op: string
          op_pai_id: string | null
          origem_demanda: string
          produto: string
          quantidade_planejada: number
          quantidade_produzida_real: number | null
          referencia_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          almoxarifado_producao?: string | null
          created_at?: string
          criado_por?: string | null
          data_conclusao_real?: string | null
          data_inicio_real?: string | null
          data_planejada?: string | null
          desc_produto?: string | null
          id?: string
          numero_op: string
          op_pai_id?: string | null
          origem_demanda?: string
          produto: string
          quantidade_planejada: number
          quantidade_produzida_real?: number | null
          referencia_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          almoxarifado_producao?: string | null
          created_at?: string
          criado_por?: string | null
          data_conclusao_real?: string | null
          data_inicio_real?: string | null
          data_planejada?: string | null
          desc_produto?: string | null
          id?: string
          numero_op?: string
          op_pai_id?: string | null
          origem_demanda?: string
          produto?: string
          quantidade_planejada?: number
          quantidade_produzida_real?: number | null
          referencia_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_producao_op_pai_id_fkey"
            columns: ["op_pai_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
        ]
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
          metodo_override: string | null
          origem: string
          origem_abastecimento: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cobertura_dias?: number
          created_at?: string
          dias_seguranca?: number
          frequencia_abastecimento?: string
          id?: string
          metodo_override?: string | null
          origem: string
          origem_abastecimento?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cobertura_dias?: number
          created_at?: string
          dias_seguranca?: number
          frequencia_abastecimento?: string
          id?: string
          metodo_override?: string | null
          origem?: string
          origem_abastecimento?: string
          updated_at?: string
        }
        Relationships: []
      }
      parametros_dispersao: {
        Row: {
          id: number
          limite_atencao_pct: number
          limite_critico_pct: number
          updated_at: string
        }
        Insert: {
          id?: number
          limite_atencao_pct?: number
          limite_critico_pct?: number
          updated_at?: string
        }
        Update: {
          id?: number
          limite_atencao_pct?: number
          limite_critico_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      parametros_inventario: {
        Row: {
          almoxarifado_id: string
          ativo: boolean
          created_at: string
          id: string
          referencia_id: string
          tipo_escopo: string
          updated_at: string
        }
        Insert: {
          almoxarifado_id: string
          ativo?: boolean
          created_at?: string
          id?: string
          referencia_id: string
          tipo_escopo: string
          updated_at?: string
        }
        Update: {
          almoxarifado_id?: string
          ativo?: boolean
          created_at?: string
          id?: string
          referencia_id?: string
          tipo_escopo?: string
          updated_at?: string
        }
        Relationships: []
      }
      perfis: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          role_key: Database["public"]["Enums"]["app_role"] | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          role_key?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          role_key?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
        }
        Relationships: []
      }
      periodos_sazonais: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          data_fim: string
          data_inicio: string
          escopo_tipo: string
          escopo_valor: string | null
          id: string
          indice_multiplicador: number
          nome: string
          origem_indice: string
          recorrente_anual: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          data_fim: string
          data_inicio: string
          escopo_tipo: string
          escopo_valor?: string | null
          id?: string
          indice_multiplicador?: number
          nome: string
          origem_indice?: string
          recorrente_anual?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          data_fim?: string
          data_inicio?: string
          escopo_tipo?: string
          escopo_valor?: string | null
          id?: string
          indice_multiplicador?: number
          nome?: string
          origem_indice?: string
          recorrente_anual?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      permissoes: {
        Row: {
          id: string
          modulo_id: string
          perfil_id: string
          pode_aprovar: boolean
          pode_criar: boolean
          pode_editar: boolean
          pode_excluir: boolean
          pode_visualizar: boolean
          updated_at: string
        }
        Insert: {
          id?: string
          modulo_id: string
          perfil_id: string
          pode_aprovar?: boolean
          pode_criar?: boolean
          pode_editar?: boolean
          pode_excluir?: boolean
          pode_visualizar?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          modulo_id?: string
          perfil_id?: string
          pode_aprovar?: boolean
          pode_criar?: boolean
          pode_editar?: boolean
          pode_excluir?: boolean
          pode_visualizar?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissoes_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos_sistema"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      producao_consumo: {
        Row: {
          ano_mes: string
          created_at: string
          criado_por: string | null
          desc_material: string | null
          desc_produto: string | null
          id: string
          id_op: string
          material: string
          produto: string | null
          qtd_consumo: number
          qtd_dif: number | null
          qtd_previsto: number
          qtd_produzida: number | null
          um: string | null
          updated_at: string
        }
        Insert: {
          ano_mes: string
          created_at?: string
          criado_por?: string | null
          desc_material?: string | null
          desc_produto?: string | null
          id?: string
          id_op: string
          material: string
          produto?: string | null
          qtd_consumo?: number
          qtd_dif?: number | null
          qtd_previsto?: number
          qtd_produzida?: number | null
          um?: string | null
          updated_at?: string
        }
        Update: {
          ano_mes?: string
          created_at?: string
          criado_por?: string | null
          desc_material?: string | null
          desc_produto?: string | null
          id?: string
          id_op?: string
          material?: string
          produto?: string | null
          qtd_consumo?: number
          qtd_dif?: number | null
          qtd_previsto?: number
          qtd_produzida?: number | null
          um?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      produtos_reposicao: {
        Row: {
          ativo: boolean
          cobertura_dias: number
          created_at: string
          custo_referencia: number
          descricao: string
          estoque_ideal: number
          estoque_maximo: number
          estoque_minimo: number
          id: string
          id_produto: string
          importado_por: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cobertura_dias?: number
          created_at?: string
          custo_referencia?: number
          descricao?: string
          estoque_ideal?: number
          estoque_maximo?: number
          estoque_minimo?: number
          id?: string
          id_produto: string
          importado_por?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cobertura_dias?: number
          created_at?: string
          custo_referencia?: number
          descricao?: string
          estoque_ideal?: number
          estoque_maximo?: number
          estoque_minimo?: number
          id?: string
          id_produto?: string
          importado_por?: string | null
          unidade?: string
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
          perfil_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome?: string
          perfil_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          perfil_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      quebras_fefo: {
        Row: {
          codigo_produto: string
          created_at: string
          descricao: string | null
          detalhes: Json
          id: string
          id_local: string | null
          item_missao_id: string | null
          missao_id: string | null
          observacao: string | null
          origem: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          status: string
          total_contado: number
          total_sistemico: number
          updated_at: string
          usuario: string | null
        }
        Insert: {
          codigo_produto: string
          created_at?: string
          descricao?: string | null
          detalhes?: Json
          id?: string
          id_local?: string | null
          item_missao_id?: string | null
          missao_id?: string | null
          observacao?: string | null
          origem?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          total_contado?: number
          total_sistemico?: number
          updated_at?: string
          usuario?: string | null
        }
        Update: {
          codigo_produto?: string
          created_at?: string
          descricao?: string | null
          detalhes?: Json
          id?: string
          id_local?: string | null
          item_missao_id?: string | null
          missao_id?: string | null
          observacao?: string | null
          origem?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          total_contado?: number
          total_sistemico?: number
          updated_at?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quebras_fefo_item_missao_id_fkey"
            columns: ["item_missao_id"]
            isOneToOne: false
            referencedRelation: "missoes_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quebras_fefo_missao_id_fkey"
            columns: ["missao_id"]
            isOneToOne: false
            referencedRelation: "missoes"
            referencedColumns: ["id"]
          },
        ]
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
          item_missao_id: string | null
          lote: string
          missao_id: string | null
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
          item_missao_id?: string | null
          lote?: string
          missao_id?: string | null
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
          item_missao_id?: string | null
          lote?: string
          missao_id?: string | null
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
          {
            foreignKeyName: "recontagem_item_missao_id_fkey"
            columns: ["item_missao_id"]
            isOneToOne: false
            referencedRelation: "missoes_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recontagem_missao_id_fkey"
            columns: ["missao_id"]
            isOneToOne: false
            referencedRelation: "missoes"
            referencedColumns: ["id"]
          },
        ]
      }
      recontagem_arquivada: {
        Row: {
          acuracidade: number | null
          aprovado_em: string | null
          aprovado_por: string | null
          arquivado_em: string
          arquivado_por: string | null
          codigo_produto: string
          contagem: number
          descricao: string
          escopo_lote: string | null
          id: string
          id_local: string
          inventario_id: string | null
          lote: string
          motivo: string | null
          motivo_arquivamento: string | null
          origem: string
          recontagem_id: string | null
          saldo_sistema: number
          status: string
          usuario: string | null
        }
        Insert: {
          acuracidade?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquivado_em?: string
          arquivado_por?: string | null
          codigo_produto: string
          contagem: number
          descricao: string
          escopo_lote?: string | null
          id?: string
          id_local: string
          inventario_id?: string | null
          lote: string
          motivo?: string | null
          motivo_arquivamento?: string | null
          origem: string
          recontagem_id?: string | null
          saldo_sistema: number
          status: string
          usuario?: string | null
        }
        Update: {
          acuracidade?: number | null
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquivado_em?: string
          arquivado_por?: string | null
          codigo_produto?: string
          contagem?: number
          descricao?: string
          escopo_lote?: string | null
          id?: string
          id_local?: string
          inventario_id?: string | null
          lote?: string
          motivo?: string | null
          motivo_arquivamento?: string | null
          origem?: string
          recontagem_id?: string | null
          saldo_sistema?: number
          status?: string
          usuario?: string | null
        }
        Relationships: []
      }
      requisicao_itens: {
        Row: {
          created_at: string
          custo_unitario: number
          descricao: string
          id: string
          id_produto: string
          lotes_separados: Json
          motivo_nao_separacao: string | null
          observacao: string | null
          quantidade_aprovada: number | null
          quantidade_atendida: number | null
          quantidade_separada: number
          quantidade_solicitada: number
          requisicao_id: string
          separado_em: string | null
          separado_por: string | null
          status_item: string
          unidade: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          created_at?: string
          custo_unitario?: number
          descricao: string
          id?: string
          id_produto: string
          lotes_separados?: Json
          motivo_nao_separacao?: string | null
          observacao?: string | null
          quantidade_aprovada?: number | null
          quantidade_atendida?: number | null
          quantidade_separada?: number
          quantidade_solicitada?: number
          requisicao_id: string
          separado_em?: string | null
          separado_por?: string | null
          status_item?: string
          unidade?: string
          updated_at?: string
          valor_total?: number
        }
        Update: {
          created_at?: string
          custo_unitario?: number
          descricao?: string
          id?: string
          id_produto?: string
          lotes_separados?: Json
          motivo_nao_separacao?: string | null
          observacao?: string | null
          quantidade_aprovada?: number | null
          quantidade_atendida?: number | null
          quantidade_separada?: number
          quantidade_solicitada?: number
          requisicao_id?: string
          separado_em?: string | null
          separado_por?: string | null
          status_item?: string
          unidade?: string
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "requisicao_itens_requisicao_id_fkey"
            columns: ["requisicao_id"]
            isOneToOne: false
            referencedRelation: "requisicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      requisicoes: {
        Row: {
          aprovador: string | null
          created_at: string
          data_aprovacao: string | null
          id: string
          metodo_utilizado: string | null
          motivo_rejeicao: string | null
          numero: string
          observacao: string | null
          origem_fornecedora: string
          origem_solicitante: string
          solicitante: string
          status: string
          tipo: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          aprovador?: string | null
          created_at?: string
          data_aprovacao?: string | null
          id?: string
          metodo_utilizado?: string | null
          motivo_rejeicao?: string | null
          numero: string
          observacao?: string | null
          origem_fornecedora: string
          origem_solicitante: string
          solicitante: string
          status?: string
          tipo?: string
          updated_at?: string
          valor_total?: number
        }
        Update: {
          aprovador?: string | null
          created_at?: string
          data_aprovacao?: string | null
          id?: string
          metodo_utilizado?: string | null
          motivo_rejeicao?: string | null
          numero?: string
          observacao?: string | null
          origem_fornecedora?: string
          origem_solicitante?: string
          solicitante?: string
          status?: string
          tipo?: string
          updated_at?: string
          valor_total?: number
        }
        Relationships: []
      }
      solicitacoes_baixa: {
        Row: {
          created_at: string
          data_solicitacao: string
          id: number
          id_local: string | null
          motivo_baixa_id: string | null
          observacao: string | null
          origem_lancamento: string
          slack_erro: string | null
          slack_notificado_at: string | null
          solicitante_id: string
          solicitante_nome: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_solicitacao?: string
          id?: number
          id_local?: string | null
          motivo_baixa_id?: string | null
          observacao?: string | null
          origem_lancamento?: string
          slack_erro?: string | null
          slack_notificado_at?: string | null
          solicitante_id?: string
          solicitante_nome?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_solicitacao?: string
          id?: number
          id_local?: string | null
          motivo_baixa_id?: string | null
          observacao?: string | null
          origem_lancamento?: string
          slack_erro?: string | null
          slack_notificado_at?: string | null
          solicitante_id?: string
          solicitante_nome?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_baixa_motivo_baixa_id_fkey"
            columns: ["motivo_baixa_id"]
            isOneToOne: false
            referencedRelation: "motivo_baixa"
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
      tarefas_operacionais: {
        Row: {
          checklist_modelo_id: string | null
          concluido_em: string | null
          concluido_por: string | null
          created_at: string
          criado_por: string | null
          data_prevista: string | null
          descricao: string | null
          evidencia_url: string | null
          familia: string | null
          grupo_produto: string | null
          id: string
          loja_setor: string | null
          missao_id: string | null
          observacao: string | null
          prioridade: string
          recorrencia: string
          responsavel_id: string | null
          responsavel_label: string | null
          responsavel_tipo: string
          sku_ou_local: string | null
          status: string
          tarefa_origem_id: string | null
          tipo_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          checklist_modelo_id?: string | null
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_prevista?: string | null
          descricao?: string | null
          evidencia_url?: string | null
          familia?: string | null
          grupo_produto?: string | null
          id?: string
          loja_setor?: string | null
          missao_id?: string | null
          observacao?: string | null
          prioridade?: string
          recorrencia?: string
          responsavel_id?: string | null
          responsavel_label?: string | null
          responsavel_tipo?: string
          sku_ou_local?: string | null
          status?: string
          tarefa_origem_id?: string | null
          tipo_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          checklist_modelo_id?: string | null
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          criado_por?: string | null
          data_prevista?: string | null
          descricao?: string | null
          evidencia_url?: string | null
          familia?: string | null
          grupo_produto?: string | null
          id?: string
          loja_setor?: string | null
          missao_id?: string | null
          observacao?: string | null
          prioridade?: string
          recorrencia?: string
          responsavel_id?: string | null
          responsavel_label?: string | null
          responsavel_tipo?: string
          sku_ou_local?: string | null
          status?: string
          tarefa_origem_id?: string | null
          tipo_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_operacionais_checklist_modelo_id_fkey"
            columns: ["checklist_modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_checklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_operacionais_missao_id_fkey"
            columns: ["missao_id"]
            isOneToOne: false
            referencedRelation: "missoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_operacionais_tarefa_origem_id_fkey"
            columns: ["tarefa_origem_id"]
            isOneToOne: false
            referencedRelation: "tarefas_operacionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_operacionais_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_tarefa"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_tarefa: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          integra_com: string | null
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          integra_com?: string | null
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          integra_com?: string | null
          nome?: string
          ordem?: number
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
      usuario_almoxarifados: {
        Row: {
          codigo_origem: string
          created_at: string
          user_id: string
        }
        Insert: {
          codigo_origem: string
          created_at?: string
          user_id: string
        }
        Update: {
          codigo_origem?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_almoxarifados_codigo_origem_fkey"
            columns: ["codigo_origem"]
            isOneToOne: false
            referencedRelation: "origens"
            referencedColumns: ["codigo_origem"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      almoxarifados_permitidos: { Args: { _uid: string }; Returns: string[] }
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
        | "COORDENADOR_CONTROLE"
        | "VENDEDOR"
        | "OPERADOR_ESTOQUE"
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
        "COORDENADOR_CONTROLE",
        "VENDEDOR",
        "OPERADOR_ESTOQUE",
      ],
    },
  },
} as const
