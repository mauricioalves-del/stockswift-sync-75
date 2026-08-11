# Stock Savvy

PROMPT COMPLETO — SISTEMA DE INVENTÁRIO EM NUVEM

Crie uma aplicação WEB completa de INVENTÁRIO EM NUVEM utilizando:

React

Typescript

Vite

TailwindCSS

Shadcn UI

Supabase

IndexedDB

PWA

XLSX

Recharts

Objetivo da aplicação:

Desenvolver um sistema profissional de inventário operacional com:

Upload de estoque sistêmico

Contagem de inventário

Comparação automática

Dashboard gerencial

Operação offline

Leitura de código de barras

Exportação Excel

Controle de recontagem

Inventário cego

Aplicativo mobile instalável

1. ESTRUTURA DO BANCO DE DADOS

Criar tabela:

estoque_sistemico

Campos:

id

id_produto

lote

descricao

unidade

quantidade

custo_unitario

id_local

cliente

data_validade

data_importacao

Tipos:

id UUID

quantidade NUMERIC

custo_unitario NUMERIC

demais TEXT

Criar tabela:

inventario

Campos:

id

id_produto

lote

descricao

unidade

saldo_sistemico

quantidade_contada

acuracidade

divergencia

valor_divergencia

status

contagem_numero

usuario

data_contagem

sincronizado

Criar tabela:

usuarios

Campos:

id

nome

email

perfil

Perfis:

ADMINISTRADOR

INVENTARIANTE

CONSULTA

2. AUTENTICAÇÃO

Implementar login com Supabase Auth.

Criar:

Tela Login

Recuperar senha

Logout

Controle de sessão

Permissões:

ADMINISTRADOR:

acesso total

INVENTARIANTE:

realizar contagem

CONSULTA:

apenas visualizar dashboards

3. IMPORTAÇÃO DE PLANILHA

Criar tela:

Upload Estoque Sistêmico

Aceitar arquivos:

.xlsx

.xls

.csv

Campos esperados:

Id_Lote

Id_Produto

Qtd

Descricao

Unidade

Custo_Unitario

Id_Local

Cliente

Data_Validade

Ao importar:

validar campos obrigatórios

exibir preview

salvar dados na tabela estoque_sistemico

Exibir:

quantidade de registros importados

erros encontrados

data da importação

4. TELA DE INVENTÁRIO

Criar tela operacional responsiva.

Pesquisa por:

código produto

lote

descrição

Exibir:

produto

descrição

lote

unidade

local

saldo sistêmico

validade

Campo:

quantidade contada

Botão:

salvar contagem

5. INVENTÁRIO CEGO

Criar configuração:

[ ] Exibir saldo sistêmico

Quando desabilitado:

ocultar saldo sistêmico do operador.

O operador verá apenas:

código

descrição

lote

6. LEITURA DE CÓDIGO DE BARRAS

Implementar leitura utilizando câmera do celular.

Biblioteca:

html5-qrcode

Compatível:

EAN13

CODE128

QRCode

Datamatrix

Fluxo:

Abrir câmera

Ler código

Localizar produto automaticamente

Exibir lotes disponíveis

Permitir contagem

Caso exista apenas 1 lote:

selecionar automaticamente.

Caso existam múltiplos lotes:

exibir lista de seleção.

Adicionar:

botão ativar câmera

botão trocar câmera

botão fechar câmera

7. REGRA DE ACURACIDADE

Fórmula:

acuracidade =
(quantidade_contada / saldo_sistemico) * 100

Status:

VERDE:

acuracidade >= 97

acuracidade <= 100

AMARELO:

acuracidade > 100

VERMELHO:

acuracidade < 97

Aplicar cores:

VERDE:
#16a34a

AMARELO:
#facc15

VERMELHO:
#dc2626

8. CÁLCULO DE DIVERGÊNCIA

Criar campo:

divergencia

Fórmula:

quantidade_contada - saldo_sistemico

Criar campo:

valor_divergencia

Fórmula:

ABS(divergencia * custo_unitario)

9. RECONTAGEM AUTOMÁTICA

Quando:

acuracidade < 97

Alterar status para:

RECONTAGEM NECESSÁRIA

Fluxo:

1ª Contagem
↓
Recontagem
↓
Aprovação Final

Permitir:

segunda contagem

aprovação do supervisor

histórico de alterações

10. OPERAÇÃO OFFLINE

Transformar aplicação em PWA.

Implementar:

Service Worker

IndexedDB

Permitir:

funcionamento sem internet

armazenamento local

sincronização automática

Quando internet retornar:

sincronizar automaticamente com Supabase.

Adicionar indicador:

🟢 ONLINE
🔴 OFFLINE

Criar painel:

registros pendentes

botão sincronizar agora

11. DASHBOARD GERENCIAL

Criar dashboard executivo moderno.

KPIs:

Total Inventariado

Itens Acurados

Divergência Positiva

Divergência Negativa

Acuracidade Geral

Divergência Financeira

Inventário Concluído

Fórmulas:

Acuracidade Geral:
Itens acurados / itens inventariados

Inventário Concluído:
Itens contados / itens planejados

Gráficos:

Rosca:

Acurados

Positivos

Negativos

Barras:
Top 10 Divergências Financeiras

Pareto:
80% das perdas

HeatMap:
Divergência por Local

Evolução:
Contagens por hora

Utilizar:

Recharts

12. TABELA OPERACIONAL

Criar tabela dinâmica com:

paginação

filtros

ordenação

busca rápida

Filtros:

produto

lote

local

status

usuário

data

13. EXPORTAÇÃO EXCEL

Criar botão:

FINALIZAR INVENTÁRIO

Gerar automaticamente:

Ficha_Inventario.xlsx

Utilizar biblioteca:

xlsx

Layout:

| Grupo | Código | Descrição | Chave | Lote | Unidade | Contagem 1 | Data Validade |

Mapeamento:

Grupo = "MATÉRIA PRIMA"
Código = id_produto
Descrição = descricao
Lote = lote
Unidade = unidade
Contagem 1 = quantidade_contada
Data Validade = data_validade

14. EXPORTAÇÃO PDF

Criar botão:

EXPORTAR PDF

Gerar relatório contendo:

KPIs

gráfico

divergências

resumo executivo

15. MOBILE

Aplicação deve ser:

responsiva

otimizada para celular

instalável como APP

Compatível:

Android

iPhone

16. INTERFACE

Criar interface moderna corporativa.

Tema:

industrial/logística

clean

dashboards executivos

Utilizar:

cards

ícones

tabelas modernas

animações suaves

17. NOTIFICAÇÕES

Criar notificações toast para:

importação concluída

erro de leitura

sincronização

inventário salvo

divergência encontrada

18. LOGS

Criar histórico de auditoria:

usuário

ação

data

alteração realizada

19. PERFORMANCE

Aplicação deve suportar:

100 mil registros

paginação server-side

lazy loading

cache local

20. PUBLICAÇÃO

Preparar deploy:

Frontend:

Vercel

Banco:

Supabase

PWA:

habilitado

Gerar aplicação pronta para produção.

21. DIFERENCIAIS

Adicionar:

modo escuro

atalhos teclado

scanner contínuo

sons de confirmação

ranking de divergências

ranking operadores

tempo médio contagem

22. DESIGN SYSTEM

Paleta:

VERDE:
#16a34a

VERMELHO:
#dc2626

AMARELO:
#facc15

CINZA:
#1f2937

23. EXPERIÊNCIA DO USUÁRIO

Fluxo deve ser rápido e operacional.

Objetivo:

permitir inventário em fábrica e almoxarifado com poucos cliques.

24. ESTRUTURA FINAL

Gerar:

frontend completo

banco Supabase

telas

componentes

responsividade

regras de negócio

dashboard

exportações

autenticação

sincronização offline

scanner código barras

PWA instalável

Aplicação pronta para uso em produção.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://stockswift-sync-75.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5450c1fe-7c22-4797-a513-67a1f69e6d60).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
