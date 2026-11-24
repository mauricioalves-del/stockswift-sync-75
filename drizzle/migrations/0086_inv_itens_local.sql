ALTER TABLE public.inv_itens ADD COLUMN IF NOT EXISTS local_fisico text;

CREATE OR REPLACE FUNCTION public.inv_locais(p_inv uuid)
RETURNS TABLE(id uuid, local_fisico text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT i.id, i.local_fisico FROM inv_itens i
  WHERE i.inventario_id = p_inv AND i.local_fisico IS NOT NULL
    AND (public.has_role(auth.uid(), 'ADMINISTRADOR'::app_role)
         OR i.dupla_id IN (SELECT inv_minhas_duplas(p_inv)) OR i.dupla_recontagem_id IN (SELECT inv_minhas_duplas(p_inv)))
$$;

CREATE OR REPLACE FUNCTION public.inv_definir_local(p_item uuid, p_local text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE i record;
BEGIN
  SELECT * INTO i FROM inv_itens WHERE id = p_item; IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF NOT (public.has_role(auth.uid(), 'ADMINISTRADOR'::app_role)
          OR COALESCE(i.dupla_id IN (SELECT inv_minhas_duplas(i.inventario_id)), false)
          OR COALESCE(i.dupla_recontagem_id IN (SELECT inv_minhas_duplas(i.inventario_id)), false)) THEN
    RAISE EXCEPTION 'Item não está na lista da sua dupla';
  END IF;
  UPDATE inv_itens SET local_fisico = nullif(left(btrim(p_local), 120), '') WHERE id = p_item;
END $$;

REVOKE ALL ON FUNCTION public.inv_locais(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inv_definir_local(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_locais(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inv_definir_local(uuid, text) TO authenticated;