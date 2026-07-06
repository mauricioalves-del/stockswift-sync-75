CREATE TABLE public.parametros_inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_escopo TEXT NOT NULL CHECK (tipo_escopo IN ('Missao','Usuario')),
  referencia_id UUID NOT NULL,
  almoxarifado_id TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo_escopo, referencia_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parametros_inventario TO authenticated;
GRANT ALL ON public.parametros_inventario TO service_role;

ALTER TABLE public.parametros_inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parametros_inv_read" ON public.parametros_inventario
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "parametros_inv_write" ON public.parametros_inventario
  FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "parametros_inv_update" ON public.parametros_inventario
  FOR UPDATE TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "parametros_inv_delete" ON public.parametros_inventario
  FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_parametros_inv_updated BEFORE UPDATE ON public.parametros_inventario
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_parametros_inv_lookup ON public.parametros_inventario (tipo_escopo, referencia_id) WHERE ativo = true;