# Sistema de Inventário em Nuvem — Plano de Implementação

Aplicação web profissional (PWA) para inventário operacional com contagem, scanner de código de barras, dashboard gerencial, modo offline e exportações.

## Stack
- Frontend: React + TypeScript + Vite + TanStack Start (já configurado)
- UI: TailwindCSS + Shadcn UI
- Backend: Lovable Cloud (Supabase) — auth, database, RLS
- Offline: IndexedDB (`idb`) + Service Worker (vite-plugin-pwa)
- Scanner: `html5-qrcode`
- Planilhas: `xlsx` (SheetJS)
- PDF: `jspdf` + `jspdf-autotable`
- Gráficos: `recharts`

## Fase 1 — Fundação
1. Ativar Lovable Cloud (Supabase)
2. Criar design system industrial (verde #16a34a, vermelho #dc2626, amarelo #facc15, cinza #1f2937), dark mode toggle, tokens em `src/styles.css`
3. Layout app (sidebar + topbar com indicador ONLINE/OFFLINE + badge pendentes)

## Fase 2 — Banco de Dados (migrations)
- `app_role` enum: ADMINISTRADOR | INVENTARIANTE | CONSULTA
- `user_roles` (com `has_role()` security definer)
- `profiles` (id, nome, email)
- `estoque_sistemico` (campos do prompt)
- `inventario` (com contagem_numero, status, sincronizado)
- `audit_logs` (usuário, ação, data, payload)
- `app_config` (chave/valor — ex.: `inventario_cego`)
- RLS + GRANTs em todas as tabelas; trigger de criação automática de profile + role default INVENTARIANTE no signup

## Fase 3 — Autenticação
- `/auth` (login + signup + recuperar senha)
- `/reset-password`
- `_authenticated/` layout (gate gerenciado)
- Hook `useRole` para gating de UI

## Fase 4 — Telas Principais
- `/` Dashboard gerencial (KPIs + 5 gráficos Recharts)
- `/importar` Upload XLSX/CSV → preview → insert em lote em `estoque_sistemico`
- `/inventario` Lista + busca/filtros + paginação server-side
- `/inventario/contar` Tela operacional de contagem (com toggle inventário cego)
- `/inventario/scanner` Scanner de código de barras (html5-qrcode, troca de câmera)
- `/recontagem` Itens com status RECONTAGEM NECESSÁRIA + aprovação
- `/relatorios` Exportar Excel (Ficha_Inventario.xlsx) + PDF
- `/usuarios` (ADMIN) gestão de perfis
- `/logs` (ADMIN) auditoria

## Fase 5 — Regras de Negócio
- Acuracidade = (contada/sistêmico)*100 → cores (≥97 e ≤100 verde; >100 amarelo; <97 vermelho + status RECONTAGEM)
- Divergência = contada − sistêmico
- Valor divergência = |divergência × custo_unitario|
- Fluxo: 1ª contagem → recontagem (se <97%) → aprovação supervisor (ADMIN)

## Fase 6 — Offline / PWA
- `idb` wrapper: filas `pending_counts`, cache `estoque_sistemico_cache`
- Service Worker via `vite-plugin-pwa` (autoUpdate, NetworkFirst para navegações, guarda anti-preview)
- Manifest + ícones (gerados)
- Sincronização automática ao voltar online + botão "Sincronizar agora"

## Fase 7 — Exportações
- Excel: layout exato (Grupo, Código, Descrição, Chave, Lote, Unidade, Contagem 1, Data Validade)
- PDF: KPIs + tabela divergências + resumo

## Fase 8 — Diferenciais
- Modo escuro
- Atalhos teclado (/, n, s)
- Scanner contínuo
- Sons de confirmação (beep)
- Rankings (divergências, operadores, tempo médio)
- Toasts (sonner) em todos os eventos

## Detalhes Técnicos
- Server functions (`createServerFn` + `requireSupabaseAuth`) para: import de planilha, salvar contagem (com cálculo de acuracidade/divergência server-side), aprovar recontagem, listar inventário paginado, KPIs do dashboard
- Triggers SQL para calcular `acuracidade`, `divergencia`, `valor_divergencia`, `status` automaticamente no insert/update da tabela `inventario`
- Função SQL `dashboard_kpis()` para agregações performáticas
- Lazy-load do scanner (`html5-qrcode` é pesado)
- Paginação server-side com `range()` do Supabase
- Limites: planilha até 100k linhas via chunked insert (500 por batch)

## Entrega
Aplicação pronta para produção, instalável como PWA, com seed mínima de role ADMIN para o primeiro usuário cadastrado.
