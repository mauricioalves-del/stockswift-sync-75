# Portfólio de Abastecimento: classificação, vendas e indicadores

## Diagnóstico dos anexos e do portal

- A planilha contém **63 SKUs: 46 Linha, 12 MTO, 4 Inovação e 1 “Deconplex”**, sem códigos duplicados. “Deconplex” será normalizado para **Decomplex**, sem criar uma quinta classe. Os códigos serão conciliados com o cadastro, preservando zeros à esquerda.
- Os prints mostram controles de classificação e validação mensal que **não existem neste código nem no banco atual**. A importação de carga, o sortimento por loja, vendas, caixaria e cobertura existentes serão reaproveitados; não será criado outro portal.
- Hoje o sortimento é uma lista atual por loja, sem aprovação ou versão histórica. Foram encontrados 103 ativos em Jesuino, 66 em Eldorado e 66 em Patio; os totais dos prints não são os totais atuais e não serão impostos ao cadastro.
- A classificação ABC existente representa giro de vendas, não Linha/MTO/Inovação/Decomplex. São dimensões diferentes e **ABC não será substituída**.
- O dashboard e a disponibilidade mensal usam fotos diárias, mas não registram classe de portfólio ou versão aprovada. A rotina pode substituir a foto de um dia ao executá-la novamente. A consulta atual tem 224 registros, todos de 14/10/2026: não existe evidência para reconstruir aprovações passadas.
- Os indicadores de vendas trabalham com meta × realizado e famílias. A nova classificação será apresentada também nessa análise, sem apagar vendas nem excluir MTO/Inovação/Decomplex dos resultados comerciais.
- Não foi encontrada a expiração automática de Inovação exibida no print. Ela será adicionada com a regra confirmada: **três meses**.

## Decisões já confirmadas

- Inovação fica fora da meta OOS durante três meses e depois passa a ser elegível automaticamente; o histórico permanece com a elegibilidade que tinha em cada data.
- Aprovação atrasada vale **na data da aprovação**, sem recalcular dias anteriores.
- MTO e Decomplex ficam fora do numerador e denominador do OOS, mas continuam aparecendo em estoque, vendas e reposição.
- Sem aprovação no mês, utilizar a última versão aprovada da loja e manter o mês pendente. Sem qualquer aprovação anterior, exibir “Sem portfólio validado” e OOS “N/A”.
- **Cadastro Central e Comercial ainda não foram associados aos perfis atuais.** Até essa definição, apenas Administrador terá poderes de classificação e aprovação; nenhum outro perfil receberá acesso por suposição.

## Etapa 1 — Classificação e importação

- Incorporar gestão de portfólio à seção **Parâmetros** de Abastecimento, mantendo caixaria, cobertura e cargas nos seus módulos atuais.
- Reaproveitar leitura e conferência de planilhas existentes para oferecer modelo Excel compatível com o cadastro e com o anexo.
- Mostrar prévia dos 63 SKUs, códigos conciliados, classes anteriores/novas e inconsistências. Confirmar antes de gravar; rejeitar duplicados, classes inválidas, códigos inexistentes e conflitos.
- Não sobrescrever caixaria, exposição, custos ou vendas com campos ausentes da planilha.
- Registrar classificação, data de início/vigência, autor e histórico de mudanças. Para Inovação, exigir data de início; não inventar datas retroativas a partir dos prints.
- Proteger edição e importação de classes no banco, além dos botões. Admin inicialmente; Cadastro Central somente após a associação dos perfis.

**Aceite:** importar o anexo com prévia, testar arquivo inválido e tentativa de reclassificação por usuário sem autorização; nenhuma alteração parcial em importação rejeitada.

## Etapa 2 — Sortimento e validação mensal

- Adicionar a visão de sortimento por loja conforme os prints: seletor, busca, filtros, ativos/inativos, contadores por classe e seleção de SKUs.
- Não mostrar Mínimo, Abastecimento 10 dias ou Máximo nessa visão. Preservar esses valores e os controles já existentes na gestão.
- Separar portfólio proposto do aprovado. Edição da proposta não altera a base oficial.
- Aprovar por loja e competência com responsável, horário, versão e cópia imutável dos SKUs/classes. Revalidar cria nova versão com incluídos, retirados e reclassificados; desfazer registra evento sem apagar versões ou indicadores.
- Exibir claramente portfólio validado, pendente herdado e sem aprovação, com origem da versão utilizada.
- Não criar aprovações fictícias para o cadastro atual. A primeira aprovação será explícita.

**Aceite:** setembro aprovado/outubro pendente utiliza setembro sem aprovar outubro; revalidação conserva versão anterior; aprovação atrasada não muda dias anteriores.

## Etapa 3 — Vendas e indicadores

- Centralizar a classificação efetiva por SKU/data e o portfólio aprovado por loja/data para as telas de Abastecimento.
- Incluir classe e filtros Linha/MTO/Inovação/Decomplex nas análises de vendas, meta × realizado e exportações pertinentes; conservar ABC, famílias, metas e totais comerciais.
- Atualizar Dashboard de Disponibilidade, Disponibilidade e rupturas e indicadores de saúde para usar a mesma base elegível no OOS.
- OOS diário = SKUs ativos elegíveis com saldo disponível **igual a zero** ÷ total de SKUs ativos elegíveis. Base vazia = **N/A**. Preservar a definição de saldo disponível; saldo negativo continua visível como anomalia, sem ser silenciosamente convertido em zero.
- Manter o acumulado por item-dia elegível no período, registrando versão e elegibilidade em cada foto diária. Não filtrar históricos usando a classificação atual.
- Separar OOS oficial dos demais números operacionais. Produtos fora da meta continuam nos alertas, estoque e reposição, com identificação “Fora da meta OOS”.
- Não alterar fórmulas de sugestão de reposição, metas comerciais ou o filtro por grupo como efeito colateral da classificação.

**Aceite:** 1 SKU regular zerado entre 2 regulares = 50%, independentemente dos MTO zerados; Inovação volta a contar após três meses; mudança de Linha para MTO não altera indicadores anteriores; vendas e sugestões permanecem intactas.

## Etapa 4 — Auditoria e validação integrada

- Consultar versões por loja/competência, responsáveis, importações, revisões e comparativos.
- Testar continuidade, expiração de Inovação, vigência tardia, base vazia, permissões, importação transacional e preservação histórica.
- Conferir pelo portal importação → proposta → aprovação → consulta de versão → OOS/vendas e exportações, com uma conta autorizada.
- Após cada etapa, apresentar **Implementado → Testado → Resultado → Próximo passo**; pedir aprovação antes de avançar à próxima fase estrutural.

## Detalhes técnicos

- Migrações aditivas: classificação com vigência/auditoria, propostas, aprovações versionadas e itens imutáveis; referências opcionais de versão/classe/elegibilidade nas fotos diárias existentes.
- Não reutilizar `classificacao_abc.classe` para classe de portfólio nem assumir que `tipo_produto` seja essa classificação sem conciliar os valores existentes.
- Operações transacionais autenticadas, com usuário derivado da sessão, políticas no banco e proteção contra atualizações diretas não autorizadas. Regras permissivas existentes não podem furar as novas restrições.
- Ajustar a coleta diária para não apagar o passado e para guardar a base vigente. Preservar registros legados identificados como anteriores ao versionamento, sem classificá-los retroativamente.
- Usar os componentes, navegação, importadores e paginação existentes; atualizar metadados das páginas alteradas e manter testes pequenos das regras junto ao projeto.

## Segurança já resolvida nesta análise

Conforme sua escolha “Equipe aprovada”, as três leituras abertas — motivos de baixa, checagens FEFO e comentários de dispersão — foram limitadas a perfis explicitamente aprovados. Políticas restritivas impedem outras regras de contornar a aprovação. Teste de acesso real passou com 12 verificações, e os três alertas foram marcados como corrigidos.

## Limites e riscos

- Ainda não foram alteradas classificações, vendas, aprovações ou cálculos OOS: o anexo exige aprovação deste diagnóstico e execução por etapas.
- A planilha será a proposta inicial, não uma ordem para retirar automaticamente os demais produtos do sortimento.
- Permissões de Cadastro Central/Comercial aguardam associação; o avanço inicial usa somente Admin.
- Não há aprovação histórica comprovada para reconstruir meses passados. Preservar legado é diferente de inventar um portfólio aprovado.