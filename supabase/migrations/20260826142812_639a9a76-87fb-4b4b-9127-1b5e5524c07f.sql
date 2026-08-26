-- 1) itens_missao_lotes: escrita restrita ao responsável da missão, inventariante ou gestor
CREATE OR REPLACE FUNCTION public.pode_contar_item_missao(_item_missao_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_gestor(_uid)
      OR public.has_role(_uid, 'INVENTARIANTE')
      OR EXISTS (
        SELECT 1
        FROM public.missoes_itens mi
        JOIN public.missoes m ON m.id = mi.missao_id
        WHERE mi.id = _item_missao_id
          AND m.responsavel_id = _uid
      )
$$;

REVOKE ALL ON FUNCTION public.pode_contar_item_missao(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_contar_item_missao(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Autenticados podem inserir lotes de itens de missão" ON public.itens_missao_lotes;
DROP POLICY IF EXISTS "Autenticados podem atualizar lotes de itens de missão" ON public.itens_missao_lotes;
DROP POLICY IF EXISTS "Autenticados podem excluir lotes de itens de missão" ON public.itens_missao_lotes;

CREATE POLICY "Responsavel ou gestor pode inserir lotes de itens de missão"
ON public.itens_missao_lotes FOR INSERT TO authenticated
WITH CHECK (public.pode_contar_item_missao(item_missao_id, auth.uid()));

CREATE POLICY "Responsavel ou gestor pode atualizar lotes de itens de missão"
ON public.itens_missao_lotes FOR UPDATE TO authenticated
USING (public.pode_contar_item_missao(item_missao_id, auth.uid()))
WITH CHECK (public.pode_contar_item_missao(item_missao_id, auth.uid()));

CREATE POLICY "Responsavel ou gestor pode excluir lotes de itens de missão"
ON public.itens_missao_lotes FOR DELETE TO authenticated
USING (public.pode_contar_item_missao(item_missao_id, auth.uid()));

-- 2) quebras_fefo: insert restrito ao responsável da missão, inventariante ou gestor
DROP POLICY IF EXISTS "Autenticados podem inserir quebras de fefo" ON public.quebras_fefo;

CREATE POLICY "Responsavel ou gestor pode inserir quebras de fefo"
ON public.quebras_fefo FOR INSERT TO authenticated
WITH CHECK (
  public.is_gestor(auth.uid())
  OR public.has_role(auth.uid(), 'INVENTARIANTE')
  OR (item_missao_id IS NOT NULL AND public.pode_contar_item_missao(item_missao_id, auth.uid()))
  OR (missao_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.missoes m
        WHERE m.id = quebras_fefo.missao_id AND m.responsavel_id = auth.uid()
      ))
);

-- 3) Funções SECURITY DEFINER não devem ser executáveis por visitantes anônimos
REVOKE ALL ON FUNCTION public.notificar_atlas_baixa_operacional() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validar_vinculo_baixa_campanha() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.proximo_numero_req_op() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pode_ver_documento_baixa(text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.proximo_numero_req_op() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_ver_documento_baixa(text, uuid) TO authenticated;