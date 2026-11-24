-- Desempenho: as políticas de RLS chamavam as funções de permissão (usuario_aprovado, is_gestor, has_role,
-- equipe_aprovada_para_leitura) linha a linha — milhões de leituras em profiles/user_roles/usuario_almoxarifados.
-- Envolver a chamada em (SELECT ...) faz o Postgres avaliá-la uma única vez por consulta (InitPlan).
-- A regra de acesso não muda: só a forma de avaliar.
DO $$
DECLARE r record; nq text; nc text; n integer := 0;
  re1 constant text := '(?<!SELECT )\m(public\.)?(usuario_aprovado|is_gestor|equipe_aprovada_para_leitura)\(auth\.uid\(\)\)';
  re2 constant text := '(?<!SELECT )\m(public\.)?has_role\(auth\.uid\(\), ''[A-Za-z_]+''::(public\.)?app_role\)';
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' LOOP
    nq := r.qual; nc := r.with_check;
    IF nq IS NOT NULL THEN nq := regexp_replace(regexp_replace(nq, re1, '(SELECT \&)', 'g'), re2, '(SELECT \&)', 'g'); END IF;
    IF nc IS NOT NULL THEN nc := regexp_replace(regexp_replace(nc, re1, '(SELECT \&)', 'g'), re2, '(SELECT \&)', 'g'); END IF;
    IF nq IS DISTINCT FROM r.qual OR nc IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename)
        || CASE WHEN nq IS NOT NULL THEN format(' USING (%s)', nq) ELSE '' END
        || CASE WHEN nc IS NOT NULL THEN format(' WITH CHECK (%s)', nc) ELSE '' END;
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '% políticas otimizadas', n;
END $$;

-- Índices usados pelas funções de permissão
CREATE INDEX IF NOT EXISTS log_prestadores_user_idx ON public.log_prestadores (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_roles_user_role_idx ON public.user_roles (user_id, role);
CREATE INDEX IF NOT EXISTS usuario_almoxarifados_user_idx ON public.usuario_almoxarifados (user_id);
ANALYZE public.profiles; ANALYZE public.user_roles; ANALYZE public.usuario_almoxarifados; ANALYZE public.log_prestadores;
