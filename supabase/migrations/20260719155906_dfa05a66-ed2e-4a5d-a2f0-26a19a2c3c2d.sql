
ALTER TABLE public.grupo_produtos
  ADD COLUMN IF NOT EXISTS eh_produto_local BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_grupo_produtos_eh_produto_local
  ON public.grupo_produtos(codigo_produto) WHERE eh_produto_local = true;

-- Semente: os dois SKUs já confirmados, além de marcar automaticamente
-- qualquer código já categorizado como Grupo = 'Produto Local'.
UPDATE public.grupo_produtos
  SET eh_produto_local = true
  WHERE codigo_produto IN ('05304029','05304043')
     OR grupo = 'Produto Local';
