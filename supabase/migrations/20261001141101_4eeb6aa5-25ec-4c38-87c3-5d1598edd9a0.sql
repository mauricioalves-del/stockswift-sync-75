-- dispersao_acoes_corretivas: gestão ou participantes da ação
drop policy if exists "dac_select_authenticated" on public.dispersao_acoes_corretivas;
create policy "dac_select_partes_ou_gestao"
  on public.dispersao_acoes_corretivas for select to authenticated
  using (
    public.has_role(auth.uid(), 'ADMINISTRADOR'::app_role)
    or public.has_role(auth.uid(), 'GERENTE'::app_role)
    or public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'::app_role)
    or public.has_role(auth.uid(), 'DIRETOR_OPERACOES'::app_role)
    or aberto_por = auth.uid()
    or fechado_por = auth.uid()
    or auth.uid()::text = any(responsaveis_ids)
  );

-- ficha_tecnica_revisoes: gestão, autor ou aprovadores
drop policy if exists "Autenticados leem revisoes de FT" on public.ficha_tecnica_revisoes;
create policy "revisoes_ft_select_partes_ou_gestao"
  on public.ficha_tecnica_revisoes for select to authenticated
  using (
    public.is_gestor(auth.uid())
    or public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'::app_role)
    or public.has_role(auth.uid(), 'DIRETOR_OPERACOES'::app_role)
    or criado_por = auth.uid()
    or aprovador_producao_id = auth.uid()
    or aprovador_suprimentos_id = auth.uid()
  );

-- origens: ativas para todos, inativas só para gestores
drop policy if exists "origens_select_auth" on public.origens;
create policy "origens_select_ativas_ou_gestor"
  on public.origens for select to authenticated
  using (ativo = true or public.is_gestor(auth.uid()));
