CREATE OR REPLACE FUNCTION public.pode_na_matriz(_uid uuid, _rota text, _acao text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH r AS (
    SELECT role FROM public.user_roles WHERE user_id = _uid
    ORDER BY CASE role WHEN 'ADMINISTRADOR' THEN 1 WHEN 'INVENTARIANTE' THEN 2 ELSE 3 END
    LIMIT 1
  ), pf AS (
    SELECT COALESCE(
      (SELECT pe.id FROM public.perfis pe
         JOIN public.profiles p ON p.perfil_id = pe.id
         JOIN r ON pe.role_key = r.role
        WHERE p.id = _uid),
      (SELECT pe.id FROM public.perfis pe JOIN r ON pe.role_key = r.role
        ORDER BY pe.created_at LIMIT 1)
    ) AS id
  )
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.permissoes pm
      JOIN public.modulos_sistema m ON m.id = pm.modulo_id
      JOIN pf ON pm.perfil_id = pf.id
     WHERE m.rota = _rota
       AND CASE _acao
             WHEN 'visualizar' THEN pm.pode_visualizar
             WHEN 'criar' THEN pm.pode_criar
             WHEN 'editar' THEN pm.pode_editar
             WHEN 'aprovar' THEN pm.pode_aprovar
             WHEN 'excluir' THEN pm.pode_excluir
             ELSE false
           END
  )
$$;

CREATE OR REPLACE FUNCTION public.abast_pode_ver_modulos(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _uid IS NOT NULL AND public.usuario_aprovado(_uid) AND (
    public.is_gestor(_uid)
    OR public.has_role(_uid, 'COORDENADOR_CONTROLE'::app_role)
    OR public.pode_na_matriz(_uid, '/abastecimento/dashboard', 'visualizar')
    OR public.pode_na_matriz(_uid, '/abastecimento/estoque', 'visualizar')
    OR public.pode_na_matriz(_uid, '/abastecimento/reposicao', 'visualizar')
    OR public.pode_na_matriz(_uid, '/abastecimento/pedidos', 'visualizar')
  )
$$;

CREATE OR REPLACE FUNCTION public.abast_pode_operar_pedidos(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _uid IS NOT NULL AND public.usuario_aprovado(_uid) AND (
    public.is_gestor(_uid)
    OR public.pode_na_matriz(_uid, '/abastecimento/pedidos', 'editar')
    OR public.pode_na_matriz(_uid, '/abastecimento/pedidos', 'criar')
  )
$$;

REVOKE ALL ON FUNCTION public.pode_na_matriz(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.abast_pode_ver_modulos(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.abast_pode_operar_pedidos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_na_matriz(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abast_pode_ver_modulos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abast_pode_operar_pedidos(uuid) TO authenticated;

CREATE POLICY "Matriz Abastecimento le config" ON public.abast_config FOR SELECT TO authenticated USING (public.abast_pode_ver_modulos(auth.uid()));
CREATE POLICY "Matriz Abastecimento le consenso" ON public.abast_consenso FOR SELECT TO authenticated USING (public.abast_pode_ver_modulos(auth.uid()));
CREATE POLICY "Matriz Abastecimento le disponibilidade" ON public.abast_disponibilidade_diaria FOR SELECT TO authenticated USING (public.abast_pode_ver_modulos(auth.uid()));
CREATE POLICY "Matriz Abastecimento le lojas" ON public.abast_lojas FOR SELECT TO authenticated USING (public.abast_pode_ver_modulos(auth.uid()));
CREATE POLICY "Matriz Abastecimento le cobertura" ON public.abast_param_cobertura FOR SELECT TO authenticated USING (public.abast_pode_ver_modulos(auth.uid()));
CREATE POLICY "Matriz Abastecimento le pedidos" ON public.abast_pedidos FOR SELECT TO authenticated USING (public.abast_pode_ver_modulos(auth.uid()));
CREATE POLICY "Matriz Abastecimento le itens de pedidos" ON public.abast_pedido_itens FOR SELECT TO authenticated USING (public.abast_pode_ver_modulos(auth.uid()));
CREATE POLICY "Matriz Abastecimento le produtos" ON public.abast_produto FOR SELECT TO authenticated USING (public.abast_pode_ver_modulos(auth.uid()));
CREATE POLICY "Matriz Abastecimento le produto loja" ON public.abast_produto_loja FOR SELECT TO authenticated USING (public.abast_pode_ver_modulos(auth.uid()));
CREATE POLICY "Matriz Abastecimento le estoque de todos os almox" ON public.estoque_sistemico FOR SELECT TO authenticated USING (public.abast_pode_ver_modulos(auth.uid()));

-- Baixas em aberto para o cálculo da reposição: só produto, almox e quantidade (sem solicitante/motivo).
CREATE OR REPLACE FUNCTION public.abast_baixas_reposicao(p_status text[])
RETURNS TABLE(id uuid, codigo_produto text, id_local text, quantidade numeric, status_fluxo text, data_execucao timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if not public.abast_pode_ver_modulos(auth.uid()) then raise exception 'acesso negado'; end if;
  return query
    select b.id, b.codigo_produto, b.id_local, b.quantidade, b.status_fluxo, b.data_execucao
      from public.baixa_operacional b
     where b.status_fluxo = any(p_status) and b.data_execucao is null;
end $$;
REVOKE ALL ON FUNCTION public.abast_baixas_reposicao(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abast_baixas_reposicao(text[]) TO authenticated;

-- Fluxo logístico do pedido: gestor como antes; operador autorizado na matriz marca Separado (sem requisição), Enviado e Recebido nos seus almox.
CREATE OR REPLACE FUNCTION public.abast_atualizar_pedido(p_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare _alm text; _req uuid; _perm text[];
begin
  if not public.is_gestor(auth.uid()) then
    if p_status not in ('SEPARADO', 'ENVIADO', 'RECEBIDO') or not public.abast_pode_operar_pedidos(auth.uid()) then
      raise exception 'acesso negado: somente gestor ou operador com permissao em Pedidos';
    end if;
    select public.abast__almox_origem(tipo, loja_origem), requisicao_id into _alm, _req from public.abast_pedidos where id = p_id;
    if not found then raise exception 'pedido nao encontrado'; end if;
    if p_status = 'SEPARADO' and _req is not null then
      raise exception 'pedido com requisicao: faca a separacao na tela Requisicoes';
    end if;
    _perm := public.almoxarifados_permitidos(auth.uid());
    if _perm is not null and not (_alm = any(_perm)) then
      raise exception 'acesso negado: o pedido sai do almoxarifado %, fora dos seus almoxarifados', _alm;
    end if;
  end if;
  return public.abast__atualizar_pedido(auth.uid(), p_id, p_status);
end $$;