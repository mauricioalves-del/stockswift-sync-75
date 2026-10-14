CREATE OR REPLACE FUNCTION public.equipe_aprovada_para_leitura(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.aprovado IS TRUE); $$;
REVOKE ALL ON FUNCTION public.equipe_aprovada_para_leitura(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.equipe_aprovada_para_leitura(uuid) TO authenticated, service_role;
ALTER POLICY "motivo_baixa read auth" ON public.motivo_baixa TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
ALTER POLICY "chk_select_auth" ON public.checagens_fefo TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
ALTER POLICY "Autenticados leem comentarios" ON public.dispersao_acao_comentarios TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "equipe aprovada limita leitura" ON public.motivo_baixa AS RESTRICTIVE FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "equipe aprovada limita leitura" ON public.checagens_fefo AS RESTRICTIVE FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));
CREATE POLICY "equipe aprovada limita leitura" ON public.dispersao_acao_comentarios AS RESTRICTIVE FOR SELECT TO authenticated USING (public.equipe_aprovada_para_leitura(auth.uid()));