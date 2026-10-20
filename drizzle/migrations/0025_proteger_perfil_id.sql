CREATE OR REPLACE FUNCTION public.proteger_perfil_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.perfil_id IS DISTINCT FROM OLD.perfil_id
     AND auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(),'ADMINISTRADOR') OR public.has_role(auth.uid(),'COORDENADOR_CONTROLE')) THEN
    RAISE EXCEPTION 'Somente administrador ou coordenador de controle pode alterar o perfil.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proteger_perfil_id ON public.profiles;
CREATE TRIGGER trg_proteger_perfil_id BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.proteger_perfil_id();