# Correção de grupos das Baixas Operacionais

## Portfólio de Abastecimento conforme anexos
- [x] Preparar diagnóstico e plano incremental antes de alterações estruturais.
- [x] Confirmar Inovação por três meses, aprovação com vigência na data e leitura para equipe aprovada.
- [ ] Identificar quem representa Cadastro Central e Comercial (aguarda definição; manter apenas Admin até lá).
- [x] Criar classificação versionada, importação e prévia; testar prévia dos 63 SKUs sem gravar o anexo.
- [ ] Validar gravação real da importação (aguarda datas reais de início dos quatro SKUs de Inovação).
- [ ] Implementar sortimento, aprovação versionada e indicadores (aguarda aprovação da próxima etapa).
- [ ] Validar regras e regressões de vendas, estoque e reposição.
- [x] Limitar leitura de fichas técnicas, períodos sazonais e necessidades de materiais à equipe aprovada; testes hosted passaram e três alertas foram marcados como corrigidos.

## Destaque MoM e segurança
- [x] Mover a análise MoM para o topo do dashboard, preservando os cálculos existentes.
- [x] Validar a posição e a exibição do gráfico.
- [x] Definir com o usuário leitura para equipe aprovada e aplicar proteção aos três dados sinalizados.
- [x] Validar acesso real para equipe aprovada, bloquear perfil ausente e registrar correção dos três alertas.

- [x] Preencher os 115 códigos sem grupo a partir da planilha, preservando cadastros existentes.
- [x] Carregar todos os grupos no dashboard e tratar falhas de consulta.
- [x] Validar cadastro, totais, dashboard e exportação HTML: zero baixas sem grupo, 999 baixas intactas, 1.561 grupos carregados, total do período preservado em R$ 86.826,33 e recuperação de falha testada.

## Filtro de status na execução de missão
- [x] Permitir selecionar mais de um status ao mesmo tempo (Pendente, Acurado, Divergente, Quebra de FEFO).
- [x] Validar na tela: 24 (Acurado) → 42 (+Divergente) → 43 (+Quebra de FEFO), "Limpar" volta a 43.

## Abastecimento: ordenar e filtrar por Sugestão
- [x] Adicionar "Ordenar por: Sugestão (maior → menor)" na tela de Abastecimento.
- [x] Adicionar filtro "Somente com sugestão" (traz apenas itens com sugestão de abastecimento).
- [x] Validar na tela: 269 linhas → 43 com sugestão (mín. 1) e ordem 270, 47, 42, 36, 35… descendente.