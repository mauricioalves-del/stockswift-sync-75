-- Pilar Controle Logístico · gestão de transportes (TMS): cadastros, solicitações, 3 cotações por destino,
-- ordem de serviço, follow-up, portal do prestador (custos/cobranças com nota) e alimentação automática do painel.
-- Modelo inspirado em plataformas abertas de TMS (pedido → cotação por tabela de serviço → ordem → eventos → comprovante).

-- Centros de custo já cadastrados na operação (baixas, origens) + os usados no histórico de fretes
CREATE OR REPLACE VIEW public.log_centros_custo AS
SELECT DISTINCT btrim(cc) AS centro_custo FROM (
  SELECT centro_custo AS cc FROM public.origens UNION ALL
  SELECT centro_custo FROM public.contexto_baixa_opcoes UNION ALL
  SELECT cc FROM public.log_envios) x
WHERE nullif(btrim(cc), '') IS NOT NULL;
GRANT SELECT ON public.log_centros_custo TO authenticated;

CREATE TABLE IF NOT EXISTS public.log_prestadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  tipo text NOT NULL DEFAULT 'transportadora' CHECK (tipo IN ('pj','transportadora','aplicativo','aerea','correios','motorista')),
  documento text, contato text, email text, telefone text,
  user_id uuid,                -- acesso ao portal do prestador
  modais text[] NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Tabela de serviço (service rate): como o prestador cobra por zona e modal
CREATE TABLE IF NOT EXISTS public.log_tabelas_frete (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id uuid NOT NULL REFERENCES public.log_prestadores(id) ON DELETE CASCADE,
  modal text NOT NULL CHECK (modal IN ('rodoviario','aereo','aplicativo','correios','veiculo_proprio')),
  zona text NOT NULL CHECK (zona IN ('grande_sp','interior_sp','fora_estado','para_sp','sp_para')),
  valor_fixo numeric NOT NULL DEFAULT 0, valor_km numeric NOT NULL DEFAULT 0, valor_kg numeric NOT NULL DEFAULT 0,
  minimo numeric NOT NULL DEFAULT 0, prazo_dias numeric, termico boolean NOT NULL DEFAULT false,
  observacao text, ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.log_embalagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE, tipo text NOT NULL CHECK (tipo IN ('isopor','gelox','caixa','outro')),
  capacidade_kg numeric, custo numeric NOT NULL, ativo boolean NOT NULL DEFAULT true
);
INSERT INTO public.log_embalagens (nome, tipo, capacidade_kg, custo) VALUES
 ('Gelox P','gelox',NULL,2.00),('Gelox M','gelox',NULL,4.68),
 ('Isopor P','isopor',3,19.90),('Isopor M','isopor',8,29.90),('Isopor G','isopor',15,49.90),('Isopor GG 120 L','isopor',40,249.90)
ON CONFLICT (nome) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS public.log_solicitacoes_numero_seq;
CREATE TABLE IF NOT EXISTS public.log_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint NOT NULL DEFAULT nextval('public.log_solicitacoes_numero_seq') UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('entrega_b2b','transferencia','ativacao','coleta','devolucao','outro')),
  natureza text NOT NULL CHECK (natureza IN ('venda','compra','interno')),
  centro_custo text NOT NULL,
  pedido text, valor_pedido numeric, cliente text,
  origem text NOT NULL DEFAULT 'Fábrica Mágio (SP)',
  destino_endereco text, destino_cep text, destino_cidade text, destino_uf text,
  zona text CHECK (zona IN ('grande_sp','interior_sp','fora_estado','para_sp','sp_para')),
  peso_kg numeric, volumes integer, km_estimado numeric, termico boolean NOT NULL DEFAULT true,
  data_limite date, observacao text,
  status text NOT NULL DEFAULT 'cotacao' CHECK (status IN ('cotacao','aprovada','em_transporte','entregue','encerrada','cancelada')),
  solicitante uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.log_cotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.log_solicitacoes(id) ON DELETE CASCADE,
  prestador_id uuid NOT NULL REFERENCES public.log_prestadores(id),
  modal text NOT NULL, frete numeric NOT NULL DEFAULT 0, embalagem numeric NOT NULL DEFAULT 0, seguro numeric NOT NULL DEFAULT 0,
  total numeric GENERATED ALWAYS AS (frete + embalagem + seguro) STORED,
  prazo_dias numeric, origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('tabela','manual','api')),
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb, escolhida boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS log_cotacoes_sol_idx ON public.log_cotacoes (solicitacao_id);

CREATE SEQUENCE IF NOT EXISTS public.log_ordens_numero_seq;
CREATE TABLE IF NOT EXISTS public.log_ordens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint NOT NULL DEFAULT nextval('public.log_ordens_numero_seq') UNIQUE,
  solicitacao_id uuid NOT NULL REFERENCES public.log_solicitacoes(id) ON DELETE CASCADE,
  cotacao_id uuid REFERENCES public.log_cotacoes(id),
  prestador_id uuid NOT NULL REFERENCES public.log_prestadores(id),
  modal text, valor_aprovado numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'programada' CHECK (status IN ('programada','coletada','em_transito','entregue','ocorrencia','cancelada')),
  previsao date, coletado_em timestamptz, entregue_em timestamptz, recebedor text, comprovante_path text,
  aprovado_por uuid, justificativa_excecao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Follow-up: linha do tempo de cada ordem
CREATE TABLE IF NOT EXISTS public.log_eventos (
  id bigserial PRIMARY KEY,
  ordem_id uuid NOT NULL REFERENCES public.log_ordens(id) ON DELETE CASCADE,
  status text NOT NULL, descricao text, anexo_path text,
  autor uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
-- Portal do prestador: custos e cobranças com nota, para aprovação do gestor
CREATE TABLE IF NOT EXISTS public.log_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id uuid REFERENCES public.log_ordens(id) ON DELETE SET NULL,
  prestador_id uuid NOT NULL REFERENCES public.log_prestadores(id),
  data date NOT NULL DEFAULT current_date,
  tipo text NOT NULL CHECK (tipo IN ('frete','km','combustivel','estacionamento','pedagio','manutencao','embalagem','servico_mensal','outros')),
  descricao text, quantidade numeric, valor numeric NOT NULL CHECK (valor >= 0),
  centro_custo text, nota_numero text, nota_path text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','rejeitado')),
  motivo text, aprovado_por uuid, aprovado_em timestamptz,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS log_lanc_ordem_idx ON public.log_lancamentos (ordem_id);

-- Painel: endereço e zona nos envios (mapa de entregas) e vínculo com a ordem
ALTER TABLE public.log_envios ADD COLUMN IF NOT EXISTS ordem_id uuid, ADD COLUMN IF NOT EXISTS cep text, ADD COLUMN IF NOT EXISTS cidade text, ADD COLUMN IF NOT EXISTS zona text;

-- Prestador do usuário logado (portal)
CREATE OR REPLACE FUNCTION public.log_meu_prestador() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT id FROM public.log_prestadores WHERE user_id = auth.uid() AND ativo LIMIT 1 $$;
GRANT EXECUTE ON FUNCTION public.log_meu_prestador() TO authenticated;

-- Escolher a cotação: exige 3 cotações (ou justificativa), cria a ordem de serviço e o primeiro evento
CREATE OR REPLACE FUNCTION public.log_escolher_cotacao(p_cotacao uuid, p_justificativa text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; s record; n int; o uuid;
BEGIN
  IF NOT public.is_gestor(auth.uid()) THEN RAISE EXCEPTION 'Somente o gestor aprova a cotação'; END IF;
  SELECT * INTO c FROM log_cotacoes WHERE id = p_cotacao; IF NOT FOUND THEN RAISE EXCEPTION 'Cotação não encontrada'; END IF;
  SELECT * INTO s FROM log_solicitacoes WHERE id = c.solicitacao_id;
  IF s.status <> 'cotacao' THEN RAISE EXCEPTION 'Solicitação já decidida'; END IF;
  SELECT count(DISTINCT prestador_id) INTO n FROM log_cotacoes WHERE solicitacao_id = s.id;
  IF n < 3 AND nullif(btrim(p_justificativa), '') IS NULL THEN RAISE EXCEPTION 'São necessárias 3 cotações de prestadores diferentes (há %). Informe a justificativa para seguir com menos.', n; END IF;
  UPDATE log_cotacoes SET escolhida = (id = p_cotacao) WHERE solicitacao_id = s.id;
  INSERT INTO log_ordens (solicitacao_id, cotacao_id, prestador_id, modal, valor_aprovado, previsao, aprovado_por, justificativa_excecao)
  VALUES (s.id, c.id, c.prestador_id, c.modal, c.total, COALESCE(s.data_limite, current_date + COALESCE(ceil(c.prazo_dias)::int, 1)), auth.uid(), nullif(btrim(p_justificativa), ''))
  RETURNING id INTO o;
  INSERT INTO log_eventos (ordem_id, status, descricao) VALUES (o, 'programada', 'Cotação aprovada pelo gestor: ' || to_char(c.total, 'FM999G999G990D00'));
  UPDATE log_solicitacoes SET status = 'aprovada' WHERE id = s.id;
  RETURN o;
END $$;
GRANT EXECUTE ON FUNCTION public.log_escolher_cotacao(uuid, text) TO authenticated;

-- Ordem entregue → alimenta o painel (log_envios), com custo = lançamentos aprovados (ou o valor aprovado)
CREATE OR REPLACE FUNCTION public.log_sincronizar_envio(p_ordem uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; s record; p record; frete numeric; emb numeric;
BEGIN
  SELECT * INTO o FROM log_ordens WHERE id = p_ordem; IF NOT FOUND THEN RETURN; END IF;
  IF o.status <> 'entregue' THEN DELETE FROM log_envios WHERE ordem_id = o.id; UPDATE log_solicitacoes SET status = CASE WHEN o.status = 'cancelada' THEN 'cancelada' WHEN o.status IN ('coletada','em_transito','ocorrencia') THEN 'em_transporte' ELSE status END WHERE id = o.solicitacao_id; RETURN; END IF;
  SELECT * INTO s FROM log_solicitacoes WHERE id = o.solicitacao_id; SELECT * INTO p FROM log_prestadores WHERE id = o.prestador_id;
  SELECT COALESCE(sum(valor) FILTER (WHERE tipo <> 'embalagem'), 0), COALESCE(sum(valor) FILTER (WHERE tipo = 'embalagem'), 0) INTO frete, emb
    FROM log_lancamentos WHERE ordem_id = o.id AND status = 'aprovado';
  IF frete + emb = 0 THEN frete := o.valor_aprovado; END IF;
  INSERT INTO log_envios (data, pedido, valor_pedido, cliente, operacao, cc, natureza, modal, km, fora_sp, uf, origem_destino, kg, frete, isopor, gelox, seguro, cobrado, observacao, fonte, chave, ordem_id, cep, cidade, zona)
  VALUES ((COALESCE(o.entregue_em, now()) AT TIME ZONE 'America/Sao_Paulo')::date, s.pedido, s.valor_pedido, s.cliente, s.tipo, s.centro_custo, s.natureza, upper(p.nome), s.km_estimado,
          s.zona <> 'grande_sp', s.destino_uf, s.origem || ' → ' || COALESCE(s.destino_cidade, ''), s.peso_kg, frete, emb, 0, 0, 0, s.observacao, 'TMS · OS ' || o.numero, 'OS-' || o.numero, o.id, s.destino_cep, s.destino_cidade, s.zona)
  ON CONFLICT (chave) DO UPDATE SET frete = EXCLUDED.frete, isopor = EXCLUDED.isopor, data = EXCLUDED.data, cc = EXCLUDED.cc, zona = EXCLUDED.zona;
  UPDATE log_solicitacoes SET status = 'entregue' WHERE id = o.solicitacao_id AND status <> 'encerrada';
END $$;
CREATE OR REPLACE FUNCTION public.log_trg_ordem() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO log_eventos (ordem_id, status, descricao) VALUES (NEW.id, NEW.status, 'Status alterado de ' || OLD.status || ' para ' || NEW.status);
  END IF;
  PERFORM public.log_sincronizar_envio(NEW.id); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS log_ordens_sync ON public.log_ordens;
CREATE TRIGGER log_ordens_sync AFTER INSERT OR UPDATE ON public.log_ordens FOR EACH ROW EXECUTE FUNCTION public.log_trg_ordem();
CREATE OR REPLACE FUNCTION public.log_trg_lanc() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF COALESCE(NEW.ordem_id, OLD.ordem_id) IS NOT NULL THEN PERFORM public.log_sincronizar_envio(COALESCE(NEW.ordem_id, OLD.ordem_id)); END IF; RETURN COALESCE(NEW, OLD); END $$;
DROP TRIGGER IF EXISTS log_lanc_sync ON public.log_lancamentos;
CREATE TRIGGER log_lanc_sync AFTER INSERT OR UPDATE OR DELETE ON public.log_lancamentos FOR EACH ROW EXECUTE FUNCTION public.log_trg_lanc();
-- Lançamento avulso aprovado (ex.: km do PJ, serviço mensal) também alimenta o painel
CREATE OR REPLACE FUNCTION public.log_trg_lanc_avulso() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.ordem_id IS NOT NULL THEN RETURN NEW; END IF;
  DELETE FROM log_envios WHERE chave = 'LANC-' || NEW.id;
  IF NEW.status = 'aprovado' AND NEW.tipo NOT IN ('km','servico_mensal') THEN
    SELECT * INTO p FROM log_prestadores WHERE id = NEW.prestador_id;
    INSERT INTO log_envios (data, cliente, operacao, cc, natureza, modal, frete, observacao, fonte, chave)
    VALUES (NEW.data, NEW.descricao, NEW.tipo, NEW.centro_custo, 'interno', upper(p.nome), NEW.valor, NEW.nota_numero, 'TMS · lançamento', 'LANC-' || NEW.id);
  ELSIF NEW.status = 'aprovado' AND NEW.tipo = 'km' THEN
    SELECT * INTO p FROM log_prestadores WHERE id = NEW.prestador_id;
    INSERT INTO log_trechos_pj (prestador, data, destino, operacao, cc, km, valor, fonte, chave)
    VALUES (p.nome, NEW.data, NEW.descricao, NEW.tipo, NEW.centro_custo, NEW.quantidade, NEW.valor, 'TMS · lançamento', 'LANC-' || NEW.id)
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, km = EXCLUDED.km;
  END IF;
  IF NEW.status <> 'aprovado' THEN DELETE FROM log_trechos_pj WHERE chave = 'LANC-' || NEW.id; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS log_lanc_avulso ON public.log_lancamentos;
CREATE TRIGGER log_lanc_avulso AFTER INSERT OR UPDATE ON public.log_lancamentos FOR EACH ROW EXECUTE FUNCTION public.log_trg_lanc_avulso();

-- Segurança: gestor administra; aprovados leem; prestador vê as próprias ordens e lança custos
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['log_prestadores','log_tabelas_frete','log_embalagens','log_solicitacoes','log_cotacoes','log_ordens','log_eventos','log_lancamentos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "leitura" ON public.%I', t);
    EXECUTE format('CREATE POLICY "leitura" ON public.%I FOR SELECT TO authenticated USING (public.usuario_aprovado(auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "gestao" ON public.%I', t);
    EXECUTE format('CREATE POLICY "gestao" ON public.%I FOR ALL TO authenticated USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()))', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.log_solicitacoes_numero_seq, public.log_ordens_numero_seq, public.log_eventos_id_seq TO authenticated;
-- Solicitação e cotação podem ser abertas por qualquer usuário aprovado (Comercial, PCP, Marketing)
DROP POLICY IF EXISTS "abrir solicitacao" ON public.log_solicitacoes;
CREATE POLICY "abrir solicitacao" ON public.log_solicitacoes FOR INSERT TO authenticated WITH CHECK (public.usuario_aprovado(auth.uid()));
DROP POLICY IF EXISTS "cotar" ON public.log_cotacoes;
CREATE POLICY "cotar" ON public.log_cotacoes FOR INSERT TO authenticated WITH CHECK (public.usuario_aprovado(auth.uid()) AND NOT escolhida);
-- Prestador: atualiza status das próprias ordens, registra eventos e lança custos
DROP POLICY IF EXISTS "prestador ordens" ON public.log_ordens;
CREATE POLICY "prestador ordens" ON public.log_ordens FOR UPDATE TO authenticated USING (prestador_id = public.log_meu_prestador()) WITH CHECK (prestador_id = public.log_meu_prestador());
DROP POLICY IF EXISTS "prestador le ordens" ON public.log_ordens;
CREATE POLICY "prestador le ordens" ON public.log_ordens FOR SELECT TO authenticated USING (prestador_id = public.log_meu_prestador());
DROP POLICY IF EXISTS "prestador eventos" ON public.log_eventos;
CREATE POLICY "prestador eventos" ON public.log_eventos FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.log_ordens o WHERE o.id = ordem_id AND o.prestador_id = public.log_meu_prestador()));
DROP POLICY IF EXISTS "prestador lancamentos" ON public.log_lancamentos;
CREATE POLICY "prestador lancamentos" ON public.log_lancamentos FOR INSERT TO authenticated WITH CHECK (prestador_id = public.log_meu_prestador() AND status = 'pendente');
DROP POLICY IF EXISTS "prestador le lancamentos" ON public.log_lancamentos;
CREATE POLICY "prestador le lancamentos" ON public.log_lancamentos FOR SELECT TO authenticated USING (prestador_id = public.log_meu_prestador());

-- Notas e comprovantes (bucket privado)
INSERT INTO storage.buckets (id, name, public) VALUES ('logistica-docs', 'logistica-docs', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "logistica docs leitura" ON storage.objects;
CREATE POLICY "logistica docs leitura" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'logistica-docs' AND (public.is_gestor(auth.uid()) OR public.usuario_aprovado(auth.uid())));
DROP POLICY IF EXISTS "logistica docs envio" ON storage.objects;
CREATE POLICY "logistica docs envio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logistica-docs' AND (public.is_gestor(auth.uid()) OR public.log_meu_prestador() IS NOT NULL));

-- Prestadores e tabelas atuais (do histórico 2026)
INSERT INTO public.log_prestadores (nome, tipo, modais) VALUES
 ('Nelson','pj','{veiculo_proprio}'),('Prestador Miguel','pj','{veiculo_proprio}'),('Lalamove','aplicativo','{aplicativo}'),
 ('Melhor Envio','correios','{correios}'),('LATAM Cargo','aerea','{aereo}'),('GOL Log','aerea','{aereo}'),('Azul Cargo','aerea','{aereo}'),('Ermerson (Belém)','motorista','{rodoviario}')
ON CONFLICT (nome) DO NOTHING;
INSERT INTO public.log_tabelas_frete (prestador_id, modal, zona, valor_fixo, valor_km, valor_kg, minimo, prazo_dias, termico, observacao)
SELECT p.id, t.modal, t.zona, t.fixo, t.km, t.kg, t.minimo, t.prazo, t.termico, t.obs FROM public.log_prestadores p JOIN (VALUES
 ('Nelson','veiculo_proprio','grande_sp',0,2,0,0,1,false,'R$ 2/km (comercial/operação); R$ 4/km em ativação'),
 ('Lalamove','aplicativo','grande_sp',8,1.6,0,10,0,false,'Referência pela média de 2026 — ajustar com a tarifa do app'),
 ('Prestador Miguel','veiculo_proprio','grande_sp',380,0,0,380,1,false,'Estrutura de ativação, por viagem'),
 ('Melhor Envio','correios','interior_sp',15,0,4,20,3,false,'Referência — usar a cotação do Melhor Envio'),
 ('Melhor Envio','correios','fora_estado',25,0,8,30,5,false,'Referência — usar a cotação do Melhor Envio'),
 ('LATAM Cargo','aereo','para_sp',0,0,3.42,50,1,true,'BEL → CGH'),
 ('LATAM Cargo','aereo','sp_para',0,0,23,80,1,true,'CGH → BEL'),
 ('LATAM Cargo','aereo','fora_estado',0,0,12,80,1,true,'Referência para B2B fora do estado'),
 ('Ermerson (Belém)','rodoviario','para_sp',280,0,0,280,0,false,'Coleta em Belém por envio')
) AS t(nome, modal, zona, fixo, km, kg, minimo, prazo, termico, obs) ON t.nome = p.nome
WHERE NOT EXISTS (SELECT 1 FROM public.log_tabelas_frete x WHERE x.prestador_id = p.id AND x.zona = t.zona AND x.modal = t.modal);
