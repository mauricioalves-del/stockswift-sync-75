
-- 1) Approval flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS aprovado boolean NOT NULL DEFAULT false;

-- Existing users become approved automatically
UPDATE public.profiles SET aprovado = true WHERE aprovado = false;

-- 2) Update handle_new_user: first user is admin+approved; others created pending with no role
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'ADMINISTRADOR') INTO is_first;

  INSERT INTO public.profiles (id, nome, email, aprovado)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    is_first  -- primeiro usuário já entra aprovado
  ) ON CONFLICT (id) DO NOTHING;

  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'ADMINISTRADOR')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  -- Demais usuários: sem role atribuído até aprovação manual
  RETURN NEW;
END;
$function$;

-- 3) Allow gestores to update aprovado on profiles
DROP POLICY IF EXISTS "Gestores can update profiles approval" ON public.profiles;
CREATE POLICY "Gestores can update profiles approval"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'))
WITH CHECK (public.is_gestor(auth.uid()) OR public.has_role(auth.uid(), 'COORDENADOR_CONTROLE'));
