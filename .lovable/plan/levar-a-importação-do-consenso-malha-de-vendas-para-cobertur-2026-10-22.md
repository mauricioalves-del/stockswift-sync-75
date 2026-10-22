# Levar a importação do consenso (malha de vendas) para Cobertura e parâmetros

A importação de consumo fica onde está, no fim de Cobertura e parâmetros, como você pediu.

## O que muda
- O bloco **"Malha — consenso da diretoria"** sai da tela oculta Carga de dados e passa a aparecer em **Cobertura e parâmetros**, logo acima da importação de consumo.
- Ele funciona do mesmo jeito: escolher o mês, mensal ou diário, baixar o modelo, enviar o arquivo, ver a prévia com bloqueios e linhas ignoradas, aplicar e ver a malha vigente por loja. Só o administrador pode aplicar.
- A tela Carga de dados continua abrindo pelo link direto, mas deixa de mostrar o bloco da malha, para não haver dois lugares fazendo a mesma coisa.
- Os cálculos e os dados já gravados ficam iguais.

## Detalhes técnicos
- Extrair o estado, a consulta `abast-malha-vigente`, `aoEscolherMalha`, `aplicarMalha`, o download do modelo e o card da malha de `abastecimento.carga.tsx` para um novo `src/components/abast-dash/ImportarMalha.tsx`. O componente continua usando a RPC `abast_aplicar_malha` e `interpretarMalha`.
- Renderizar `<ImportarMalha />` em `abastecimento.cobertura.tsx`, antes de `<ConsumoPage />`, e invalidar as mesmas consultas depois de aplicar.
- Tirar o card da malha de `carga.tsx`.
- Conferir a tela pelo navegador, logado: o bloco aparece e a prévia lê um arquivo de modelo.
