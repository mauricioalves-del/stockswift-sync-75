DO $migration$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.abast_testar_insumos_pedido()'::regprocedure) INTO def;
 IF position('VALUES(-990001' in def)=0 THEN RAISE EXCEPTION 'Teste inesperado'; END IF;
 def:=replace(def,'VALUES(-990001','OVERRIDING SYSTEM VALUE VALUES(-990001');
 EXECUTE def;
END $migration$;