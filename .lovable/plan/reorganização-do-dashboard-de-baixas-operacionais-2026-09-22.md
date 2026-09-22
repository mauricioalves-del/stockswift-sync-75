# Reorganização do Dashboard de Baixas Operacionais

## Objetivo
Dar protagonismo à tendência mensal, transformar os recortes de motivo em três gráficos comparáveis e incluir rankings detalhados com acesso à lista completa.

## Alterações
- Mover **Tendência mensal por motivo** para uma faixa exclusiva logo abaixo dos indicadores.
- Manter as colunas empilhadas por motivo, adicionar o total sobre cada mês e uma linha de variação MoM em percentual.
- Evidenciar evolução e involução mensal com resumo visual do mês atual versus o anterior.
- Transformar **Valor por motivo** em barras horizontais.
- Criar uma segunda faixa com três gráficos: valor por motivo, rosca de **Cortesia — Área que solicitou** e funil de **Degustação — Operação**.
- Acrescentar três tabelas: **Top 10 Degustações**, **Top 10 Cortesias** e **Top 10 Outros (Sensorial e Uso e Consumo)**, ordenadas por valor.
- Incluir em cada tabela o comando **Lista completa**, abrindo uma janela filtrável com todos os itens daquela categoria no período e respeitando os filtros atuais.
- Preservar os demais blocos analíticos já existentes abaixo dessa nova estrutura.

## Detalhes técnicos
- Expandir a consulta do período com os campos de contexto necessários às áreas e operações.
- Reutilizar a janela de detalhes existente, ampliando-a para aceitar uma ou mais categorias sem duplicar consultas ou telas.
- Calcular o MoM sobre a série mensal completa, com tratamento explícito para mês anterior igual a zero.
- Usar os componentes e cores atuais do sistema e garantir leitura em telas menores.
- Validar a página em desktop, conferir a janela de lista completa e executar a verificação de tipos.
