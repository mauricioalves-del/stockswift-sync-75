CREATE OR REPLACE FUNCTION public.pode_separar_requisicoes(_uid uuid)
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
  SELECT _uid IS NOT NULL AND (
    public.is_gestor(_uid)
    OR public.has_role(_uid, 'INVENTARIANTE'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.permissoes pm
        JOIN public.modulos_sistema m ON m.id = pm.modulo_id
        JOIN pf ON pm.perfil_id = pf.id
       WHERE m.rota = '/suprimentos/requisicoes'
         AND (pm.pode_editar OR pm.pode_criar)
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_requisicao_separacao(_uid uuid, _origem text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.pode_separar_requisicoes(_uid)
     AND (public.almoxarifados_permitidos(_uid) IS NULL
          OR _origem = ANY (public.almoxarifados_permitidos(_uid)))
$$;

REVOKE ALL ON FUNCTION public.pode_separar_requisicoes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pode_ver_requisicao_separacao(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_separar_requisicoes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_ver_requisicao_separacao(uuid, text) TO authenticated;

CREATE POLICY "Separador visualiza requisicoes do seu almox"
  ON public.requisicoes FOR SELECT TO authenticated
  USING (public.pode_ver_requisicao_separacao(auth.uid(), origem_fornecedora));

CREATE POLICY "Separador visualiza itens do seu almox"
  ON public.requisicao_itens FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.requisicoes r
     WHERE r.id = requisicao_itens.requisicao_id
       AND public.pode_ver_requisicao_separacao(auth.uid(), r.origem_fornecedora)
  ));

CREATE OR REPLACE FUNCTION public.separar_requisicao(_requisicao_id uuid, _itens jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req record;
  _it record;
  _est record;
  _p jsonb;
  _a jsonb;
  _qa numeric;
  _qs numeric;
  _soma numeric;
  _lotes jsonb;
  _motivo text;
  _st_item text;
  _status text;
  _ok int := 0; _parc int := 0; _nao int := 0; _total int := 0;
  _now timestamptz := now();
  _audit jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.usuario_aprovado(_uid) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO _req FROM public.requisicoes WHERE id = _requisicao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Requisição não encontrada'; END IF;

  IF NOT public.pode_ver_requisicao_separacao(_uid, _req.origem_fornecedora) THEN
    RAISE EXCEPTION 'Sem permissão para separar requisições do almoxarifado %', _req.origem_fornecedora;
  END IF;

  IF _req.status NOT IN ('ENVIADA','APROVADA','AGUARDANDO_SEPARACAO','EM_SEPARACAO','SEPARADA_PARCIAL') THEN
    RAISE EXCEPTION 'Requisição não está disponível para separação (status %)', _req.status;
  END IF;

  IF _itens IS NULL OR jsonb_typeof(_itens) <> 'array' THEN
    RAISE EXCEPTION 'Dados de separação inválidos';
  END IF;

  FOR _it IN SELECT * FROM public.requisicao_itens
              WHERE requisicao_id = _requisicao_id ORDER BY created_at FOR UPDATE LOOP
    _total := _total + 1;
    _p := NULL;
    SELECT e INTO _p FROM jsonb_array_elements(_itens) e WHERE e->>'item_id' = _it.id::text LIMIT 1;
    IF _p IS NULL THEN
      RAISE EXCEPTION 'Item % sem dados de separação', _it.id_produto;
    END IF;

    _qs := COALESCE(NULLIF(_p->>'quantidade','')::numeric, 0);
    IF _qs < 0 THEN RAISE EXCEPTION 'Item %: quantidade inválida', _it.id_produto; END IF;
    _motivo := NULLIF(btrim(COALESCE(_p->>'motivo','')), '');
    IF _qs < _it.quantidade_solicitada AND _motivo IS NULL THEN
      RAISE EXCEPTION 'Item %: motivo obrigatório quando separar menos que o solicitado.', _it.id_produto;
    END IF;

    _soma := 0;
    _lotes := '[]'::jsonb;
    FOR _a IN SELECT * FROM jsonb_array_elements(COALESCE(_p->'alocacoes', '[]'::jsonb)) LOOP
      _qa := COALESCE(NULLIF(_a->>'quantidade','')::numeric, 0);
      IF _qa <= 0 THEN CONTINUE; END IF;
      SELECT id, id_produto, lote, data_validade, quantidade, custo_unitario, origem INTO _est
        FROM public.estoque_sistemico WHERE id = (_a->>'estoque_id')::uuid FOR UPDATE;
      IF NOT FOUND OR _est.origem IS DISTINCT FROM _req.origem_fornecedora
         OR _est.id_produto IS DISTINCT FROM _it.id_produto THEN
        RAISE EXCEPTION 'Item %: lote inválido para esta requisição', _it.id_produto;
      END IF;
      IF COALESCE(_est.quantidade, 0) < _qa THEN
        RAISE EXCEPTION 'Item % lote %: saldo insuficiente (disponível %)', _it.id_produto, _est.lote, COALESCE(_est.quantidade, 0);
      END IF;
      UPDATE public.estoque_sistemico SET quantidade = quantidade - _qa WHERE id = _est.id;
      _soma := _soma + _qa;
      _lotes := _lotes || jsonb_build_array(jsonb_build_object(
        'estoque_id', _est.id, 'lote', _est.lote, 'data_validade', _est.data_validade,
        'quantidade', _qa, 'custo_unitario', COALESCE(_est.custo_unitario, 0)));
    END LOOP;

    IF _soma <> _qs THEN
      RAISE EXCEPTION 'Item %: quantidade a separar (%) difere dos lotes alocados (%)', _it.id_produto, _qs, _soma;
    END IF;

    IF _qs >= _it.quantidade_solicitada THEN _st_item := 'SEPARADO'; _ok := _ok + 1;
    ELSIF _qs > 0 THEN _st_item := 'SEPARADO_PARCIAL'; _parc := _parc + 1;
    ELSE _st_item := 'NAO_SEPARADO'; _nao := _nao + 1;
    END IF;

    UPDATE public.requisicao_itens SET
      quantidade_separada = _qs,
      quantidade_atendida = _qs,
      status_item = _st_item,
      motivo_nao_separacao = CASE WHEN _qs < _it.quantidade_solicitada THEN _motivo ELSE NULL END,
      lotes_separados = _lotes,
      separado_por = _uid,
      separado_em = _now
    WHERE id = _it.id;

    _audit := _audit || jsonb_build_array(jsonb_build_object(
      'id', _it.id, 'sku', _it.id_produto, 'separada', _qs, 'lotes', _lotes));
  END LOOP;

  IF _total = 0 THEN RAISE EXCEPTION 'Requisição sem itens'; END IF;

  _status := CASE WHEN _ok = _total THEN 'ATENDIDA'
                  WHEN _ok + _parc > 0 THEN 'EM_SEPARACAO'
                  ELSE 'ENVIADA' END;

  UPDATE public.requisicoes SET status = _status WHERE id = _requisicao_id;

  INSERT INTO public.auditoria (entidade, entidade_id, acao, usuario, dados_depois, observacao)
  VALUES ('requisicoes', _requisicao_id::text, 'SEPARACAO', _uid,
          jsonb_build_object('status', _status, 'itens', _audit),
          format('Separação FEFO: %s ok, %s parcial, %s não separado', _ok, _parc, _nao));

  RETURN _status;
END;
$$;

REVOKE ALL ON FUNCTION public.separar_requisicao(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.separar_requisicao(uuid, jsonb) TO authenticated;