
-- ============ ENUM ============
CREATE TYPE public.app_role AS ENUM ('ADMINISTRADOR', 'INVENTARIANTE', 'CONSULTA');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'ADMINISTRADOR' THEN 1 WHEN 'INVENTARIANTE' THEN 2 ELSE 3 END
  LIMIT 1
$$;

-- Policies user_roles
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'ADMINISTRADOR'));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMINISTRADOR'));

-- Policies profiles
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'ADMINISTRADOR'));
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMINISTRADOR'));

-- ============ ESTOQUE SISTEMICO ============
CREATE TABLE public.estoque_sistemico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_produto TEXT NOT NULL,
  lote TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  unidade TEXT NOT NULL DEFAULT 'UN',
  quantidade NUMERIC NOT NULL DEFAULT 0,
  custo_unitario NUMERIC NOT NULL DEFAULT 0,
  id_local TEXT NOT NULL DEFAULT '',
  cliente TEXT NOT NULL DEFAULT '',
  data_validade DATE,
  data_importacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  importado_por UUID REFERENCES auth.users(id)
);
CREATE INDEX idx_estoque_produto ON public.estoque_sistemico(id_produto);
CREATE INDEX idx_estoque_lote ON public.estoque_sistemico(id_produto, lote);
CREATE INDEX idx_estoque_local ON public.estoque_sistemico(id_local);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_sistemico TO authenticated;
GRANT ALL ON public.estoque_sistemico TO service_role;
ALTER TABLE public.estoque_sistemico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estoque_select_auth" ON public.estoque_sistemico FOR SELECT TO authenticated USING (true);
CREATE POLICY "estoque_admin_inv_write" ON public.estoque_sistemico FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'ADMINISTRADOR') OR public.has_role(auth.uid(), 'INVENTARIANTE'));
CREATE POLICY "estoque_admin_inv_update" ON public.estoque_sistemico FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR') OR public.has_role(auth.uid(), 'INVENTARIANTE'));
CREATE POLICY "estoque_admin_delete" ON public.estoque_sistemico FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'));

-- ============ INVENTARIO ============
CREATE TABLE public.inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_produto TEXT NOT NULL,
  lote TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  unidade TEXT NOT NULL DEFAULT 'UN',
  id_local TEXT NOT NULL DEFAULT '',
  custo_unitario NUMERIC NOT NULL DEFAULT 0,
  saldo_sistemico NUMERIC NOT NULL DEFAULT 0,
  quantidade_contada NUMERIC NOT NULL DEFAULT 0,
  acuracidade NUMERIC,
  divergencia NUMERIC,
  valor_divergencia NUMERIC,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  contagem_numero INTEGER NOT NULL DEFAULT 1,
  usuario UUID REFERENCES auth.users(id),
  data_contagem TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_validade DATE,
  sincronizado BOOLEAN NOT NULL DEFAULT true,
  observacao TEXT,
  aprovado_por UUID REFERENCES auth.users(id),
  aprovado_em TIMESTAMPTZ
);
CREATE INDEX idx_inv_produto ON public.inventario(id_produto);
CREATE INDEX idx_inv_status ON public.inventario(status);
CREATE INDEX idx_inv_usuario ON public.inventario(usuario);
CREATE INDEX idx_inv_data ON public.inventario(data_contagem DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario TO authenticated;
GRANT ALL ON public.inventario TO service_role;
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_select_auth" ON public.inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv_insert_inv" ON public.inventario FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'ADMINISTRADOR') OR public.has_role(auth.uid(), 'INVENTARIANTE'));
CREATE POLICY "inv_update_inv" ON public.inventario FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR') OR public.has_role(auth.uid(), 'INVENTARIANTE'));
CREATE POLICY "inv_delete_admin" ON public.inventario FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'));

-- Trigger para cálculo automático
CREATE OR REPLACE FUNCTION public.compute_inventario_metrics()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.divergencia := COALESCE(NEW.quantidade_contada,0) - COALESCE(NEW.saldo_sistemico,0);
  NEW.valor_divergencia := ABS(COALESCE(NEW.divergencia,0)) * COALESCE(NEW.custo_unitario,0);
  IF COALESCE(NEW.saldo_sistemico,0) = 0 THEN
    IF COALESCE(NEW.quantidade_contada,0) = 0 THEN
      NEW.acuracidade := 100;
    ELSE
      NEW.acuracidade := 999;
    END IF;
  ELSE
    NEW.acuracidade := ROUND((COALESCE(NEW.quantidade_contada,0) / NEW.saldo_sistemico) * 100, 2);
  END IF;

  IF NEW.status NOT IN ('APROVADO') THEN
    IF NEW.acuracidade >= 97 AND NEW.acuracidade <= 100 THEN
      NEW.status := 'OK';
    ELSIF NEW.acuracidade > 100 THEN
      NEW.status := 'DIVERGENCIA_POSITIVA';
    ELSE
      IF NEW.contagem_numero >= 2 THEN
        NEW.status := 'AGUARDANDO_APROVACAO';
      ELSE
        NEW.status := 'RECONTAGEM_NECESSARIA';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventario_metrics
BEFORE INSERT OR UPDATE ON public.inventario
FOR EACH ROW EXECUTE FUNCTION public.compute_inventario_metrics();

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario UUID REFERENCES auth.users(id),
  acao TEXT NOT NULL,
  entidade TEXT,
  entidade_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_data ON public.audit_logs(created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_admin_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'));
CREATE POLICY "audit_insert_auth" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (usuario = auth.uid());

-- ============ APP CONFIG ============
CREATE TABLE public.app_config (
  chave TEXT NOT NULL PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
GRANT SELECT ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_select_auth" ON public.app_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_admin_write" ON public.app_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMINISTRADOR'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMINISTRADOR'));

INSERT INTO public.app_config (chave, valor) VALUES
  ('inventario_cego', 'false'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- ============ TRIGGER de novo usuário ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email
  ) ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'ADMINISTRADOR') INTO is_first;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'ADMINISTRADOR')
      ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'INVENTARIANTE')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
