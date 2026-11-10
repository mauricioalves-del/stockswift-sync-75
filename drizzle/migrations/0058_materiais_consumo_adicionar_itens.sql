-- Abastecimento:
--  1) Materiais de uso e consumo da loja: catálogo (material de apoio, cafeteria, sobremesa) + todas as gotas com saldo no CD.
--     A loja solicita a quantidade que precisa, sem caixaria; o pedido segue o fluxo normal (aguardando aprovação comercial).
--  2) "Adicionar produto" deixa de aprovar o pedido: só inclui os itens. A aprovação acontece apenas no botão Aprovar.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.abast_materiais_consumo (
  id serial PRIMARY KEY,
  sku text,                              -- null = sem cadastro no ACE4
  descricao text NOT NULL UNIQUE,
  categoria text NOT NULL,
  subcategoria text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.abast_materiais_consumo TO authenticated;
GRANT ALL ON public.abast_materiais_consumo TO service_role;
ALTER TABLE public.abast_materiais_consumo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "materiais consumo leitura" ON public.abast_materiais_consumo;
CREATE POLICY "materiais consumo leitura" ON public.abast_materiais_consumo FOR SELECT TO authenticated USING (true);

INSERT INTO public.abast_materiais_consumo (sku, descricao, categoria, subcategoria, ordem) VALUES
 ('9990712059','Cartão Fidelidade','MATERIAL DE APOIO','MATERIAL DE CONSUMO',1),
 ('9990712046','Etiqueta Lacre 1 - Adesivo com hot stam','MATERIAL DE APOIO','MATERIAL DE CONSUMO',2),
 ('0190213104','Folha papel barrado Mágio','MATERIAL DE APOIO','MATERIAL DE CONSUMO',3),
 (NULL,'Luva P','MATERIAL DE APOIO','MATERIAL DE CONSUMO',4),
 ('654','Luva M','MATERIAL DE APOIO','MATERIAL DE CONSUMO',5),
 ('656','Luva G','MATERIAL DE APOIO','MATERIAL DE CONSUMO',6),
 ('0990815001131','Saco de lixo','MATERIAL DE APOIO','MATERIAL DE CONSUMO',7),
 ('0990815001122','Perfex','MATERIAL DE APOIO','MATERIAL DE CONSUMO',8),
 ('0990815001120','Álcool','MATERIAL DE APOIO','MATERIAL DE CONSUMO',9),
 ('99081500015','Guardanapo','MATERIAL DE APOIO','MATERIAL DE CONSUMO',10),
 ('99901110421','Canela em pó','MATERIAL DE APOIO','CAFETERIA',20),
 ('02504002','Cascas de Cacau - Bom Jardim','MATERIAL DE APOIO','CAFETERIA',21),
 ('05104077','Biscoito Puxuri Chocolate - unitário','MATERIAL DE APOIO','CAFETERIA',22),
 ('05104079','Biscoito Puxuri Cupulate - unitário','MATERIAL DE APOIO','CAFETERIA',23),
 ('99081500018','Copo descartável - café coado','MATERIAL DE APOIO','CAFETERIA',24),
 ('99081500017','Copo descartável - café expresso','MATERIAL DE APOIO','CAFETERIA',25),
 ('99081500020','Copo descartável - calda','MATERIAL DE APOIO','CAFETERIA',26),
 ('099081500028','Copo descartável - praliné','MATERIAL DE APOIO','CAFETERIA',27),
 ('99081500019','Copo descartável - suco','MATERIAL DE APOIO','CAFETERIA',28),
 ('99081500022','Tampa Copo descartável - café coado','MATERIAL DE APOIO','CAFETERIA',29),
 ('99081500021','Tampa Copo descartável - café expresso','MATERIAL DE APOIO','CAFETERIA',30),
 ('99081500024','Tampa Copo descartável - calda','MATERIAL DE APOIO','CAFETERIA',31),
 ('99081500025','Tampa Copo descartável - praliné','MATERIAL DE APOIO','CAFETERIA',32),
 ('99081500023','Tampa Copo descartável - suco','MATERIAL DE APOIO','CAFETERIA',33),
 ('99081500026','Filtro V60 - 02','MATERIAL DE APOIO','CAFETERIA',34),
 ('099081500026','Filtro V60 - 01','MATERIAL DE APOIO','CAFETERIA',35),
 ('99081500016','Mexedor','MATERIAL DE APOIO','CAFETERIA',36),
 ('990866045','Sache adoçante Sucralose','MATERIAL DE APOIO','CAFETERIA',37),
 ('990866044','Sache de Açúcar Refinado Loja','MATERIAL DE APOIO','CAFETERIA',38),
 (NULL,'Canudo','MATERIAL DE APOIO','CAFETERIA',39),
 ('9990311044','Praliné de castanhas - Bolo de chocolate','SOBREMESA','BOLOS',50)
ON CONFLICT (descricao) DO NOTHING;

-- Catálogo para a tela: itens cadastrados + todas as gotas com saldo no CD, com o saldo do CD de cada item.
-- id_produto dos itens sem cadastro no ACE4 = 'SEMCAD-<id>' (a separação trata manualmente).
CREATE OR REPLACE FUNCTION public.abast_catalogo_materiais()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH cd AS (SELECT coalesce((SELECT valor FROM public.abast_config WHERE chave='cd_almoxarifado'),'Alm_SP_Fabrica') a),
  saldo AS (
    SELECT ltrim(e.id_produto,'0') k, max(e.id_produto) id_produto, max(e.descricao) descricao, sum(e.quantidade) q
      FROM public.estoque_sistemico e, cd WHERE e.origem = cd.a AND e.quantidade > 0 GROUP BY 1),
  cat AS (
    SELECT coalesce(m.sku, 'SEMCAD-'||m.id) id_produto, m.descricao, m.categoria, m.subcategoria, m.ordem, (m.sku IS NULL) sem_cadastro, false gota,
           coalesce((SELECT s.q FROM saldo s WHERE s.k = ltrim(m.sku,'0')), 0) saldo
      FROM public.abast_materiais_consumo m WHERE m.ativo),
  gotas AS (
    SELECT s.id_produto, s.descricao, 'MATERIAL DE APOIO' categoria, 'GOTAS' subcategoria, 100 ordem, false sem_cadastro, true gota, s.q saldo
      FROM saldo s WHERE s.descricao ILIKE '%gota%' AND NOT EXISTS (SELECT 1 FROM cat c WHERE ltrim(c.id_produto,'0') = s.k))
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.ordem, x.descricao), '[]'::jsonb) FROM (SELECT * FROM cat UNION ALL SELECT * FROM gotas) x;
$$;
REVOKE ALL ON FUNCTION public.abast_catalogo_materiais() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abast_catalogo_materiais() TO authenticated, service_role;

-- Solicitação de materiais de uso e consumo pela loja: quantidade livre (sem caixaria), só itens do catálogo.
CREATE OR REPLACE FUNCTION public.abast_solicitar_materiais(p_loja text, p_obs text, p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _cat jsonb; x record; _itens jsonb := '[]'::jsonb; _c jsonb;
BEGIN
  IF _uid IS NULL OR NOT (coalesce(public.is_gestor(_uid),false) OR coalesce(public.has_role(_uid,'ADMINISTRADOR'),false)) THEN RAISE EXCEPTION 'acesso negado: somente gestor' USING ERRCODE='42501'; END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'informe ao menos um material'; END IF;
  _cat := public.abast_catalogo_materiais();
  FOR x IN SELECT * FROM jsonb_to_recordset(p_itens) AS r(id_produto text, qtd numeric) LOOP
    IF x.id_produto IS NULL OR x.qtd IS NULL OR x.qtd <= 0 OR x.qtd::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'material ou quantidade invalida'; END IF;
    SELECT e INTO _c FROM jsonb_array_elements(_cat) e WHERE ltrim(e->>'id_produto','0') = ltrim(x.id_produto,'0') LIMIT 1;
    IF _c IS NULL THEN RAISE EXCEPTION 'material % fora da lista de uso e consumo', x.id_produto; END IF;
    _itens := _itens || jsonb_build_array(jsonb_build_object('id_produto', _c->>'id_produto', 'descricao', _c->>'descricao', 'qtd_sugerida', NULL, 'qtd_pedida', x.qtd, 'caixa', 1, 'origem', 'MATERIAL_CONSUMO'));
  END LOOP;
  RETURN public.abast__criar_pedido(_uid, p_loja, 'MATERIAL_CONSUMO', nullif(btrim(coalesce(p_obs,'')),''), _itens);
END $$;
REVOKE ALL ON FUNCTION public.abast_solicitar_materiais(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abast_solicitar_materiais(text,text,jsonb) TO authenticated, service_role;

-- Adicionar produtos a um pedido aguardando aprovação, SEM aprovar (mesmas regras dos produtos extras da aprovação:
-- catálogo aprovado da loja ou insumos de revenda/embalagem/matéria-prima, saldo da origem e caixaria/fracionamento).
CREATE OR REPLACE FUNCTION public.abast_adicionar_itens_pedido(p_id uuid, p_obs text, p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); p public.abast_pedidos%rowtype; _nome text; _port jsonb; x record; _alm text; _est numeric; _res numeric; _ja numeric; _cx numeric; _n int := 0; _log jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'acesso negado' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('abast-aprovacao-comercial'));
  SELECT * INTO p FROM public.abast_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pedido nao encontrado'; END IF;
  IF p.status NOT IN ('AGUARD_COMERCIAL','AGUARD_DIRETOR') THEN RAISE EXCEPTION 'so e possivel adicionar produtos a pedido aguardando aprovacao'; END IF;
  IF NOT (coalesce(public.abast__pode_editar_pedido(_uid, p.status),false) OR coalesce(public.abast_eh_signatario(_uid,'GERENTE_COMERCIAL'),false)) THEN RAISE EXCEPTION 'acesso negado: sem permissao para editar este pedido' USING ERRCODE='42501'; END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'informe ao menos um produto'; END IF;
  SELECT coalesce(nullif(nome,''),email) INTO _nome FROM public.profiles WHERE id = _uid;
  _alm := public.abast__almox_origem(p.tipo, p.loja_origem);
  SELECT itens INTO _port FROM public.abast_validacoes_portfolio WHERE loja = p.loja AND status = 'VALIDADA' ORDER BY competencia DESC, aprovado_em DESC LIMIT 1;
  _port := coalesce(_port, '[]'::jsonb);
  FOR x IN SELECT * FROM jsonb_to_recordset(p_itens) AS r(id_produto text, descricao text, qtd numeric, fracionar boolean) LOOP
    IF x.id_produto IS NULL OR x.qtd IS NULL OR x.qtd <= 0 OR x.qtd::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'produto ou quantidade invalida'; END IF;
    IF NOT (EXISTS (SELECT 1 FROM jsonb_array_elements(_port) e WHERE ltrim(e->>'sku','0') = ltrim(x.id_produto,'0') AND coalesce((e->>'ativo')::boolean,true))
            OR EXISTS (SELECT 1 FROM public.grupo_produtos g WHERE ltrim(g.codigo_produto,'0') = ltrim(x.id_produto,'0')
                       AND lower(btrim(translate(g.grupo,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCaaaaeeiooouc'))) IN ('mercadoria de revenda','embalagem','materia prima'))) THEN
      RAISE EXCEPTION 'SKU % fora do catalogo aprovado da loja', x.id_produto;
    END IF;
    SELECT s.estoque, s.reservado INTO _est, _res FROM public.abast__saldo_origem(_alm, public.abast__sku_saldo(x.id_produto), p_id) s;
    SELECT coalesce(sum(qtd_pedida),0) INTO _ja FROM public.abast_pedido_itens WHERE pedido_id = p_id AND aceito IS DISTINCT FROM false AND public.abast__sku_saldo(id_produto) = public.abast__sku_saldo(x.id_produto);
    IF x.qtd > greatest(_est - _res - _ja, 0) THEN RAISE EXCEPTION 'estoque insuficiente para SKU %: disponivel % un', x.id_produto, greatest(_est - _res - _ja, 0); END IF;
    SELECT greatest(1, ceil(coalesce(max(full_case),1))) INTO _cx FROM public.abast_produto WHERE ltrim(id_produto,'0') = ltrim(x.id_produto,'0');
    IF EXISTS (SELECT 1 FROM public.familias WHERE ltrim(codigo_produto,'0') = ltrim(x.id_produto,'0') AND lower(trim(familia)) = 'graneis') THEN _cx := 1; END IF;
    IF NOT coalesce(x.fracionar,false) AND _cx > 1 AND mod(x.qtd,_cx) <> 0 AND NOT (_est - _res - _ja < _cx) THEN RAISE EXCEPTION 'quantidade deve ser multiplo da caixa (% un) ou marcar Fracionar', _cx; END IF;
    INSERT INTO public.abast_pedido_itens (pedido_id, id_produto, descricao, qtd_sugerida, qtd_pedida, caixa, origem, aceito)
      VALUES (p_id, x.id_produto, x.descricao, NULL, x.qtd, _cx, 'SUGESTAO_COMERCIAL', true);
    _log := _log || jsonb_build_array(jsonb_build_object('em', now(), 'por', _uid, 'nome', _nome, 'acao', 'ADICIONAR', 'id_produto', x.id_produto, 'descricao', x.descricao, 'qtd_antes', 0, 'qtd_depois', x.qtd, 'motivo', nullif(btrim(coalesce(p_obs,'')),'')));
    _n := _n + 1;
  END LOOP;
  UPDATE public.abast_pedidos SET atualizado_em = now(), atualizado_por = _uid, edicoes = coalesce(edicoes,'[]'::jsonb) || _log,
    aprov_comercial_obs = CASE WHEN nullif(btrim(coalesce(p_obs,'')),'') IS NULL THEN aprov_comercial_obs ELSE concat_ws(' · ', nullif(aprov_comercial_obs,''), btrim(p_obs)) END
    WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'status', p.status, 'adicionados', _n);
END $$;
REVOKE ALL ON FUNCTION public.abast_adicionar_itens_pedido(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abast_adicionar_itens_pedido(uuid,text,jsonb) TO authenticated, service_role;

-- Na aprovação, pedido com produtos adicionados fica registrado como "com ressalvas".
DO $migration$
DECLARE def text; antigo text := 'CASE WHEN NOT p_aprovado OR _n>0 OR p.status=''AGUARD_DIRETOR'' THEN'; novo text := 'CASE WHEN NOT p_aprovado OR _n>0 OR p.status=''AGUARD_DIRETOR'' OR EXISTS(SELECT 1 FROM public.abast_pedido_itens WHERE pedido_id=p_id AND origem=''SUGESTAO_COMERCIAL'') THEN';
BEGIN
  SELECT pg_get_functiondef('public.abast_aprovar_comercial(uuid,boolean,text,jsonb)'::regprocedure) INTO def;
  IF position(novo in def) > 0 THEN RETURN; END IF;
  IF position(antigo in def) = 0 THEN RAISE EXCEPTION 'aprovacao comercial divergente: migration nao aplicada'; END IF;
  EXECUTE replace(def, antigo, novo);
END $migration$;
