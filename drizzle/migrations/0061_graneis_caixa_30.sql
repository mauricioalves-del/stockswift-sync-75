-- Granéis: caixaria fixa de 30 bombons nas sugestões extras e na aprovação comercial (detecção sem acento: "Granéis" = "graneis").
DO $$
DECLARE _f text; _def text; _novo text;
BEGIN
  FOREACH _f IN ARRAY ARRAY['abast_adicionar_itens_pedido','abast_aprovar_comercial'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = _f;
    _novo := regexp_replace(_def,
      'lower\(trim\(familia\)\)\s*=\s*''graneis''\)\s*THEN\s*_cx\s*:=\s*1;',
      'translate(lower(trim(familia)),''áàâãéêíóôõúç'',''aaaaeeiooouc'') = ''graneis'') THEN _cx := 30;', 'g');
    IF _novo = _def THEN RAISE EXCEPTION 'regra de granel nao encontrada em %', _f; END IF;
    EXECUTE _novo;
  END LOOP;
END $$;