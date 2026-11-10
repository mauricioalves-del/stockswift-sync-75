## Filtros de assinatura na Fila de Aprovação (Baixas Operacionais)

Adicionar uma linha de botões de filtro rápido (segmentados) acima da tabela, logo abaixo da barra de filtros atual:

- **Todos** (padrão)
- **Assinados DO + CF** — itens com as duas assinaturas (prontos para aprovar)
- **Pendente DO** — itens sem a assinatura do Diretor de Operações
- **Pendente CF** — itens sem a assinatura do Coordenador Financeiro

Cada botão mostra a contagem de itens. Combina com busca, almox., solicitante e motivo; "Limpar filtros" também volta para "Todos". O contador "item(ns)" reflete o filtro.

### Detalhes técnicos
- Arquivo: `src/routes/_authenticated/baixas.index.tsx`.
- Novo estado `fAssinatura: "todos" | "assinados" | "pend_do" | "pend_cf"`, aplicado no cálculo de `lista` usando a função existente `assinaturaFeita(b, "DIRETOR_OPERACOES" | "COORDENADOR_FINANCEIRO")`.
- Incluído em `temFiltro` e no reset. Apenas visual/filtro, sem mudança no banco.
