
-- 1. requisicoes: restringir SELECT a solicitante ou gestor
DROP POLICY IF EXISTS "Autenticados visualizam requisicoes" ON public.requisicoes;
CREATE POLICY "Solicitante ou gestor visualiza requisicoes"
  ON public.requisicoes FOR SELECT TO authenticated
  USING (solicitante = auth.uid() OR public.is_gestor(auth.uid()));

-- 2. requisicao_itens: restringir SELECT via requisição correspondente
DROP POLICY IF EXISTS "Autenticados visualizam itens" ON public.requisicao_itens;
CREATE POLICY "Solicitante ou gestor visualiza itens"
  ON public.requisicao_itens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.requisicoes r
      WHERE r.id = requisicao_itens.requisicao_id
        AND (r.solicitante = auth.uid() OR public.is_gestor(auth.uid()))
    )
  );

-- 3. auditoria: exigir usuario = auth.uid() no INSERT
DROP POLICY IF EXISTS "Autenticados inserem auditoria" ON public.auditoria;
CREATE POLICY "Autenticados inserem auditoria"
  ON public.auditoria FOR INSERT TO authenticated
  WITH CHECK (usuario = auth.uid());

-- 4. audit_logs: bloquear UPDATE/DELETE mesmo para admin (append-only)
CREATE POLICY "audit_logs_no_update"
  ON public.audit_logs FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "audit_logs_no_delete"
  ON public.audit_logs FOR DELETE TO authenticated
  USING (false);

-- 5. produtos_reposicao: restringir escrita a gestor
DROP POLICY IF EXISTS "Autenticados podem inserir produtos_reposicao" ON public.produtos_reposicao;
DROP POLICY IF EXISTS "Autenticados podem atualizar produtos_reposicao" ON public.produtos_reposicao;
DROP POLICY IF EXISTS "Autenticados podem apagar produtos_reposicao" ON public.produtos_reposicao;
CREATE POLICY "Gestor insere produtos_reposicao"
  ON public.produtos_reposicao FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "Gestor atualiza produtos_reposicao"
  ON public.produtos_reposicao FOR UPDATE TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "Gestor apaga produtos_reposicao"
  ON public.produtos_reposicao FOR DELETE TO authenticated
  USING (public.is_gestor(auth.uid()));

-- 6. Revogar EXECUTE de anon/PUBLIC nas funções SECURITY DEFINER expostas.
--    Mantém EXECUTE para authenticated pois são helpers usados dentro das políticas RLS.
REVOKE EXECUTE ON FUNCTION public.is_gestor(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.almoxarifados_permitidos(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
