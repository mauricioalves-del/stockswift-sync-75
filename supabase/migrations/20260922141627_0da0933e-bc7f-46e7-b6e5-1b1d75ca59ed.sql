DROP POLICY IF EXISTS "read_perfis" ON public.perfis;
CREATE POLICY "read_perfis_ativos"
ON public.perfis
FOR SELECT
TO authenticated
USING (ativo = true);

DROP POLICY IF EXISTS "Snapshots FEFO disponíveis para usuários autenticados" ON public.checagens_fefo_lotes_snapshot;
CREATE POLICY "snapshots_fefo_por_almoxarifado"
ON public.checagens_fefo_lotes_snapshot
FOR SELECT
TO authenticated
USING (
  public.almoxarifados_permitidos(auth.uid()) IS NULL
  OR origem = ANY(public.almoxarifados_permitidos(auth.uid()))
);

DROP POLICY IF EXISTS "estoque_select_auth" ON public.estoque_sistemico;
CREATE POLICY "estoque_select_por_almoxarifado"
ON public.estoque_sistemico
FOR SELECT
TO authenticated
USING (
  public.almoxarifados_permitidos(auth.uid()) IS NULL
  OR origem = ANY(public.almoxarifados_permitidos(auth.uid()))
);