CREATE OR REPLACE FUNCTION public.abast_bloquear_retorno_separacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(current_setting('app.abast_retorno',true),'')=OLD.id::text AND NEW.status IN ('ABERTO','EM_SEPARACAO','AGUARD_COMERCIAL','AGUARD_DIRETOR') AND EXISTS(SELECT 1 FROM public.requisicao_itens WHERE requisicao_id=OLD.requisicao_id AND (coalesce(quantidade_separada,0)>0 OR coalesce(quantidade_atendida,0)>0 OR jsonb_array_length(coalesce(lotes_separados,'[]'::jsonb))>0)) THEN
 RAISE EXCEPTION 'Há estoque movimentado na separação. Não é possível retornar para uma etapa que permita separar novamente.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_abast_bloquear_retorno BEFORE UPDATE OF status ON public.abast_pedidos FOR EACH ROW EXECUTE FUNCTION public.abast_bloquear_retorno_separacao();