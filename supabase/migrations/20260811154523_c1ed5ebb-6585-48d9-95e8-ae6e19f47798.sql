INSERT INTO public.perfis (nome, descricao, role_key, ativo)
SELECT 'Diretor de Operações', 'Assinatura operacional da aprovação de baixas', 'DIRETOR_OPERACOES'::public.app_role, true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE role_key = 'DIRETOR_OPERACOES'::public.app_role);

INSERT INTO public.perfis (nome, descricao, role_key, ativo)
SELECT 'Coordenador Financeiro', 'Assinatura financeira da aprovação de baixas', 'COORDENADOR_FINANCEIRO'::public.app_role, true
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE role_key = 'COORDENADOR_FINANCEIRO'::public.app_role);

WITH cfg AS (
  SELECT id FROM public.modulos_sistema WHERE chave = 'config'
), bloqueados AS (
  SELECT m.id FROM public.modulos_sistema m
  WHERE m.id IN (SELECT id FROM cfg)
     OR m.modulo_pai_id IN (SELECT id FROM cfg)
     OR m.chave LIKE 'config%'
     OR m.rota IN ('/emails', '/config', '/config/perfis')
), novos AS (
  SELECT id FROM public.perfis WHERE role_key IN ('DIRETOR_OPERACOES'::public.app_role, 'COORDENADOR_FINANCEIRO'::public.app_role)
)
INSERT INTO public.permissoes (perfil_id, modulo_id, pode_visualizar, pode_criar, pode_editar, pode_aprovar, pode_excluir)
SELECT n.id, m.id,
       m.id NOT IN (SELECT id FROM bloqueados),
       m.id NOT IN (SELECT id FROM bloqueados),
       m.id NOT IN (SELECT id FROM bloqueados),
       m.id NOT IN (SELECT id FROM bloqueados),
       m.id NOT IN (SELECT id FROM bloqueados)
FROM novos n CROSS JOIN public.modulos_sistema m
ON CONFLICT (perfil_id, modulo_id) DO UPDATE SET
  pode_visualizar = EXCLUDED.pode_visualizar,
  pode_criar = EXCLUDED.pode_criar,
  pode_editar = EXCLUDED.pode_editar,
  pode_aprovar = EXCLUDED.pode_aprovar,
  pode_excluir = EXCLUDED.pode_excluir;