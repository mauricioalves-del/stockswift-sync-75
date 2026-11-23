-- Contagem de Inventário (inventário geral): planejamento com data/hora de geração da lista, almoxarifado,
-- duplas de contagem por grupo de produtos, contagem cega por dupla, apuração de divergências, recontagem por
-- outra dupla (registro "identificado na 2ª contagem"), contagem final oficial e inclusão manual de produtos.
CREATE SEQUENCE IF NOT EXISTS public.inv_inventarios_numero_seq;
CREATE TABLE IF NOT EXISTS public.inv_inventarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint NOT NULL DEFAULT nextval('public.inv_inventarios_numero_seq') UNIQUE,
  titulo text NOT NULL,
  almoxarifado text NOT NULL,                 -- codigo_origem (estoque_sistemico.origem)
  data_geracao timestamptz NOT NULL,          -- quando a lista é gerada (fotografia do estoque)
  criterio_abc text,                          -- opcional: só uma classe ABC
  dupla_padrao_id uuid,                       -- recebe os produtos sem grupo atribuído
  status text NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado','lista_gerada','em_contagem','em_recontagem','finalizado','cancelado')),
  gerada_em timestamptz, gerada_por uuid, apurado_em timestamptz, finalizado_em timestamptz, finalizado_por uuid,
  observacao text, criado_por uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.inv_duplas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id uuid NOT NULL REFERENCES public.inv_inventarios(id) ON DELETE CASCADE,
  nome text NOT NULL, membro1 uuid NOT NULL, membro2 uuid,
  conta boolean NOT NULL DEFAULT true, reconta boolean NOT NULL DEFAULT false,
  contagem_concluida_em timestamptz, recontagem_concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.inv_dupla_grupos (
  id bigserial PRIMARY KEY,
  inventario_id uuid NOT NULL REFERENCES public.inv_inventarios(id) ON DELETE CASCADE,
  dupla_id uuid NOT NULL REFERENCES public.inv_duplas(id) ON DELETE CASCADE,
  grupo text NOT NULL,
  UNIQUE (inventario_id, grupo)               -- cada grupo é contado por uma única dupla
);
CREATE TABLE IF NOT EXISTS public.inv_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id uuid NOT NULL REFERENCES public.inv_inventarios(id) ON DELETE CASCADE,
  dupla_id uuid REFERENCES public.inv_duplas(id) ON DELETE SET NULL,
  codigo_produto text NOT NULL, descricao text, lote text NOT NULL DEFAULT '', grupo text, unidade text,
  qtd_sistema numeric NOT NULL DEFAULT 0, custo_unitario numeric,
  origem_item text NOT NULL DEFAULT 'lista' CHECK (origem_item IN ('lista','manual')),
  qtd_contagem numeric, contado_por uuid, contado_em timestamptz,
  divergente boolean,
  dupla_recontagem_id uuid REFERENCES public.inv_duplas(id) ON DELETE SET NULL,
  qtd_recontagem numeric, identificado_recontagem boolean, recontado_por uuid, recontado_em timestamptz,
  qtd_final numeric, observacao text,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventario_id, codigo_produto, lote)
);
CREATE INDEX IF NOT EXISTS inv_itens_dupla_idx ON public.inv_itens (inventario_id, dupla_id);
CREATE INDEX IF NOT EXISTS inv_itens_rec_idx ON public.inv_itens (inventario_id, dupla_recontagem_id);

-- Segurança: gestão vê e administra tudo; contadores só leem o cabeçalho e as duplas e trabalham pelas funções
-- abaixo, que devolvem apenas os itens da própria dupla, sem quantidade do sistema nem a contagem da outra dupla.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inv_inventarios','inv_duplas','inv_dupla_grupos','inv_itens'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "gestao" ON public.%I', t);
    EXECUTE format('CREATE POLICY "gestao" ON public.%I FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()))', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.inv_inventarios_numero_seq, public.inv_dupla_grupos_id_seq TO authenticated;
DROP POLICY IF EXISTS "leitura cabecalho" ON public.inv_inventarios;
CREATE POLICY "leitura cabecalho" ON public.inv_inventarios FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "leitura duplas" ON public.inv_duplas;
CREATE POLICY "leitura duplas" ON public.inv_duplas FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "leitura grupos" ON public.inv_dupla_grupos;
CREATE POLICY "leitura grupos" ON public.inv_dupla_grupos FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()));

CREATE OR REPLACE FUNCTION public.inv_sou_gestor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT public.is_gestor(auth.uid()) $$;
CREATE OR REPLACE FUNCTION public.inv_minhas_duplas(p_inv uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT id FROM public.inv_duplas WHERE inventario_id = p_inv AND auth.uid() IN (membro1, membro2) $$;

-- Gera a lista (fotografia do estoque do almoxarifado) e distribui os itens pelas duplas conforme os grupos.
CREATE OR REPLACE FUNCTION public.inv_gerar_lista(p_inv uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; n integer;
BEGIN
  SELECT * INTO v FROM inv_inventarios WHERE id = p_inv FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventário não encontrado'; END IF;
  IF v.status <> 'planejado' THEN RETURN 0; END IF;
  IF NOT public.is_gestor(auth.uid()) AND (now() < v.data_geracao OR NOT EXISTS (SELECT 1 FROM inv_minhas_duplas(p_inv))) THEN
    RAISE EXCEPTION 'A lista é gerada em %', to_char(v.data_geracao AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'); END IF;
  INSERT INTO inv_itens (inventario_id, dupla_id, codigo_produto, descricao, lote, grupo, unidade, qtd_sistema, custo_unitario, origem_item)
  SELECT p_inv, COALESCE(dg.dupla_id, v.dupla_padrao_id), e.id_produto, max(e.descricao), COALESCE(e.lote, ''), max(g.grupo), max(e.unidade), sum(e.quantidade), max(e.custo_unitario), 'lista'
  FROM estoque_sistemico e
  LEFT JOIN LATERAL (SELECT gp.grupo FROM grupo_produtos gp WHERE gp.codigo_produto = e.id_produto LIMIT 1) g ON true
  LEFT JOIN inv_dupla_grupos dg ON dg.inventario_id = p_inv AND dg.grupo = g.grupo
  WHERE e.origem = v.almoxarifado AND COALESCE(e.quantidade, 0) <> 0
    AND (v.criterio_abc IS NULL OR EXISTS (SELECT 1 FROM classificacao_abc c WHERE c.codigo_produto = e.id_produto AND c.classe = v.criterio_abc))
  GROUP BY e.id_produto, COALESCE(e.lote, ''), COALESCE(dg.dupla_id, v.dupla_padrao_id)
  ON CONFLICT (inventario_id, codigo_produto, lote) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE inv_inventarios SET status = 'lista_gerada', gerada_em = now(), gerada_por = auth.uid() WHERE id = p_inv;
  RETURN n;
END $$;

-- Itens da minha dupla (contagem) ou da minha recontagem — contagem cega: sem quantidade do sistema nem da outra contagem.
CREATE OR REPLACE FUNCTION public.inv_minhas_tarefas(p_inv uuid, p_fase text)
RETURNS TABLE (id uuid, codigo_produto text, descricao text, lote text, grupo text, unidade text, origem_item text, qtd numeric, identificado boolean, registrado_em timestamptz, dupla text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.codigo_produto, i.descricao, i.lote, i.grupo, i.unidade, i.origem_item,
         CASE WHEN p_fase = 'recontagem' THEN i.qtd_recontagem ELSE i.qtd_contagem END,
         CASE WHEN p_fase = 'recontagem' THEN i.identificado_recontagem ELSE NULL END,
         CASE WHEN p_fase = 'recontagem' THEN i.recontado_em ELSE i.contado_em END,
         d.nome
  FROM inv_itens i JOIN inv_duplas d ON d.id = CASE WHEN p_fase = 'recontagem' THEN i.dupla_recontagem_id ELSE i.dupla_id END
  WHERE i.inventario_id = p_inv AND d.id IN (SELECT inv_minhas_duplas(p_inv))
    AND (p_fase <> 'recontagem' OR i.divergente IS TRUE)
  ORDER BY i.grupo NULLS LAST, i.descricao, i.lote
$$;

-- Registra contagem (1ª) ou recontagem (2ª, vira a contagem final oficial).
CREATE OR REPLACE FUNCTION public.inv_registrar(p_item uuid, p_fase text, p_qtd numeric, p_identificado boolean DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v record;
BEGIN
  SELECT * INTO i FROM inv_itens WHERE id = p_item; IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  SELECT * INTO v FROM inv_inventarios WHERE id = i.inventario_id;
  IF p_qtd IS NULL OR p_qtd < 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  IF p_fase = 'recontagem' THEN
    IF v.status <> 'em_recontagem' THEN RAISE EXCEPTION 'A recontagem não está aberta'; END IF;
    IF i.dupla_recontagem_id IS NULL OR i.dupla_recontagem_id NOT IN (SELECT inv_minhas_duplas(i.inventario_id)) THEN RAISE EXCEPTION 'Item não está na sua recontagem'; END IF;
    IF p_identificado IS NULL THEN RAISE EXCEPTION 'Informe se o produto foi identificado na 2ª contagem'; END IF;
    UPDATE inv_itens SET qtd_recontagem = p_qtd, identificado_recontagem = p_identificado, recontado_por = auth.uid(), recontado_em = now(), qtd_final = p_qtd WHERE id = p_item;
  ELSE
    IF v.status NOT IN ('lista_gerada','em_contagem') THEN RAISE EXCEPTION 'A contagem não está aberta'; END IF;
    IF i.dupla_id IS NULL OR i.dupla_id NOT IN (SELECT inv_minhas_duplas(i.inventario_id)) THEN RAISE EXCEPTION 'Item não está na lista da sua dupla'; END IF;
    UPDATE inv_itens SET qtd_contagem = p_qtd, contado_por = auth.uid(), contado_em = now() WHERE id = p_item;
    IF v.status = 'lista_gerada' THEN UPDATE inv_inventarios SET status = 'em_contagem' WHERE id = v.id; END IF;
  END IF;
END $$;

-- Inclusão manual de produto fora da lista (inclusive sem estoque): entra na lista da dupla de quem incluiu.
CREATE OR REPLACE FUNCTION public.inv_adicionar_manual(p_inv uuid, p_codigo text, p_lote text, p_qtd numeric, p_fase text DEFAULT 'contagem', p_identificado boolean DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; d uuid; novo uuid; desc_ text; un text; sist numeric; custo numeric; grp text;
BEGIN
  SELECT * INTO v FROM inv_inventarios WHERE id = p_inv;
  IF p_fase = 'recontagem' THEN
    IF v.status <> 'em_recontagem' THEN RAISE EXCEPTION 'A recontagem não está aberta'; END IF;
    SELECT id INTO d FROM inv_duplas WHERE inventario_id = p_inv AND reconta AND id IN (SELECT inv_minhas_duplas(p_inv)) LIMIT 1;
  ELSE
    IF v.status NOT IN ('lista_gerada','em_contagem') THEN RAISE EXCEPTION 'A contagem não está aberta'; END IF;
    SELECT id INTO d FROM inv_duplas WHERE inventario_id = p_inv AND conta AND id IN (SELECT inv_minhas_duplas(p_inv)) LIMIT 1;
  END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'Você não está em uma dupla desta etapa'; END IF;
  IF EXISTS (SELECT 1 FROM inv_itens WHERE inventario_id = p_inv AND codigo_produto = p_codigo AND lote = COALESCE(p_lote, '')) THEN
    RAISE EXCEPTION 'Produto e lote já estão na lista do inventário'; END IF;
  SELECT max(descricao), max(unidade), COALESCE(sum(quantidade), 0), max(custo_unitario) INTO desc_, un, sist, custo
    FROM estoque_sistemico WHERE origem = v.almoxarifado AND id_produto = p_codigo AND COALESCE(lote, '') = COALESCE(p_lote, '');
  IF desc_ IS NULL THEN SELECT descricao, unidade, custo_unitario INTO desc_, un, custo FROM atlas_produtos WHERE sku = p_codigo; END IF;
  IF desc_ IS NULL THEN SELECT max(descricao) INTO desc_ FROM estoque_sistemico WHERE id_produto = p_codigo; END IF;
  IF desc_ IS NULL THEN RAISE EXCEPTION 'Produto % não encontrado no cadastro', p_codigo; END IF;
  SELECT grupo INTO grp FROM grupo_produtos WHERE codigo_produto = p_codigo LIMIT 1;
  INSERT INTO inv_itens (inventario_id, dupla_id, codigo_produto, descricao, lote, grupo, unidade, qtd_sistema, custo_unitario, origem_item, qtd_contagem, contado_por, contado_em, divergente, dupla_recontagem_id, qtd_recontagem, identificado_recontagem, recontado_por, recontado_em, qtd_final)
  VALUES (p_inv, CASE WHEN p_fase = 'recontagem' THEN NULL ELSE d END, p_codigo, desc_, COALESCE(p_lote, ''), grp, un, COALESCE(sist, 0), custo, 'manual',
          CASE WHEN p_fase = 'recontagem' THEN NULL ELSE p_qtd END, CASE WHEN p_fase = 'recontagem' THEN NULL ELSE auth.uid() END, CASE WHEN p_fase = 'recontagem' THEN NULL ELSE now() END,
          CASE WHEN p_fase = 'recontagem' THEN true ELSE NULL END, CASE WHEN p_fase = 'recontagem' THEN d ELSE NULL END,
          CASE WHEN p_fase = 'recontagem' THEN p_qtd END, CASE WHEN p_fase = 'recontagem' THEN COALESCE(p_identificado, true) END,
          CASE WHEN p_fase = 'recontagem' THEN auth.uid() END, CASE WHEN p_fase = 'recontagem' THEN now() END, CASE WHEN p_fase = 'recontagem' THEN p_qtd END)
  RETURNING id INTO novo;
  IF v.status = 'lista_gerada' THEN UPDATE inv_inventarios SET status = 'em_contagem' WHERE id = v.id; END IF;
  RETURN novo;
END $$;

-- Encerra a 1ª contagem: apura divergências e distribui a recontagem para duplas diferentes das que contaram.
CREATE OR REPLACE FUNCTION public.inv_apurar(p_inv uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec uuid[]; it record; k integer := 0; esc uuid; n integer := 0;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN RAISE EXCEPTION 'Somente a gestão encerra a contagem'; END IF;
  UPDATE inv_itens SET divergente = (qtd_contagem IS NULL OR qtd_contagem <> qtd_sistema) WHERE inventario_id = p_inv;
  UPDATE inv_itens SET qtd_final = qtd_contagem WHERE inventario_id = p_inv AND divergente IS FALSE;
  SELECT array_agg(id ORDER BY nome) INTO rec FROM inv_duplas WHERE inventario_id = p_inv AND reconta;
  IF rec IS NULL OR array_length(rec, 1) IS NULL THEN RAISE EXCEPTION 'Defina ao menos uma dupla de recontagem'; END IF;
  FOR it IN SELECT id, dupla_id FROM inv_itens WHERE inventario_id = p_inv AND divergente ORDER BY grupo, codigo_produto LOOP
    esc := NULL;
    FOR j IN 0 .. array_length(rec, 1) - 1 LOOP   -- próxima dupla da fila que não seja a que contou
      IF rec[((k + j) % array_length(rec, 1)) + 1] IS DISTINCT FROM it.dupla_id THEN esc := rec[((k + j) % array_length(rec, 1)) + 1]; k := k + j + 1; EXIT; END IF;
    END LOOP;
    UPDATE inv_itens SET dupla_recontagem_id = COALESCE(esc, rec[1]) WHERE id = it.id; n := n + 1;
  END LOOP;
  UPDATE inv_inventarios SET status = CASE WHEN n > 0 THEN 'em_recontagem' ELSE 'finalizado' END, apurado_em = now(),
    finalizado_em = CASE WHEN n > 0 THEN NULL ELSE now() END WHERE id = p_inv;
  RETURN n;
END $$;

-- Finaliza: recontagens pendentes só fecham com p_forcar (ficam com a 1ª contagem como final).
CREATE OR REPLACE FUNCTION public.inv_finalizar(p_inv uuid, p_forcar boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pend integer;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN RAISE EXCEPTION 'Somente a gestão finaliza o inventário'; END IF;
  SELECT count(*) INTO pend FROM inv_itens WHERE inventario_id = p_inv AND divergente AND qtd_recontagem IS NULL;
  IF pend > 0 AND NOT p_forcar THEN RAISE EXCEPTION 'Há % item(ns) aguardando recontagem', pend; END IF;
  UPDATE inv_itens SET qtd_final = COALESCE(qtd_contagem, 0) WHERE inventario_id = p_inv AND qtd_final IS NULL;
  UPDATE inv_inventarios SET status = 'finalizado', finalizado_em = now(), finalizado_por = auth.uid() WHERE id = p_inv;
END $$;

-- A dupla sinaliza que terminou a sua etapa (contagem ou recontagem).
CREATE OR REPLACE FUNCTION public.inv_concluir(p_inv uuid, p_fase text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_fase = 'recontagem' THEN UPDATE inv_duplas SET recontagem_concluida_em = now() WHERE inventario_id = p_inv AND reconta AND id IN (SELECT inv_minhas_duplas(p_inv));
  ELSE UPDATE inv_duplas SET contagem_concluida_em = now() WHERE inventario_id = p_inv AND conta AND id IN (SELECT inv_minhas_duplas(p_inv)); END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.inv_concluir(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.inv_gerar_lista(uuid), public.inv_minhas_tarefas(uuid, text), public.inv_registrar(uuid, text, numeric, boolean),
  public.inv_adicionar_manual(uuid, text, text, numeric, text, boolean), public.inv_apurar(uuid), public.inv_finalizar(uuid, boolean), public.inv_sou_gestor(), public.inv_minhas_duplas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_gerar_lista(uuid), public.inv_minhas_tarefas(uuid, text), public.inv_registrar(uuid, text, numeric, boolean),
  public.inv_adicionar_manual(uuid, text, text, numeric, text, boolean), public.inv_apurar(uuid), public.inv_finalizar(uuid, boolean), public.inv_sou_gestor(), public.inv_minhas_duplas(uuid) TO authenticated;
