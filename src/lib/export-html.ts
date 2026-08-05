/**
 * Exportação de dashboards para um arquivo HTML autocontido.
 * - Serializa o DOM do dashboard no estado atual (KPIs, gráficos SVG e tabelas)
 * - Copia o CSS da aplicação e o tema ativo (data-theme)
 * - Injeta um JS mínimo para manter interatividade offline (ordenação de tabelas,
 *   expand/collapse e realce/tooltip nos elementos de gráfico)
 */

export type FiltroChip = { label: string; valor: string };

export type ExportarHtmlParams = {
  titulo: string;
  elemento: HTMLElement;
  filtros?: FiltroChip[];
  usuario?: string;
};

function coletarCss(): string {
  const partes: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = (sheet as CSSStyleSheet).cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) partes.push(rule.cssText);
    } catch {
      // stylesheet de outra origem — ignorado
    }
  }
  return partes.join("\n");
}

function variaveisDoTema(): string {
  const cs = getComputedStyle(document.documentElement);
  const props: string[] = [];
  for (let i = 0; i < cs.length; i++) {
    const nome = cs.item(i);
    if (nome.startsWith("--")) props.push(`${nome}: ${cs.getPropertyValue(nome).trim()};`);
  }
  return props.length ? `:root{${props.join("")}}` : "";
}

function limparClone(clone: HTMLElement, origem: HTMLElement) {
  clone.querySelectorAll("[data-export-hide]").forEach((el) => el.remove());
  clone.querySelectorAll("script").forEach((el) => el.remove());

  // Congela o estado atual dos controles (o valor precisa virar atributo para
  // sobreviver à serialização) e os deixa inertes: no arquivo exportado eles
  // são apenas a evidência do filtro aplicado, não controles vivos.
  const vivos = origem.querySelectorAll("input, select, textarea");
  const clonados = clone.querySelectorAll("input, select, textarea");
  clonados.forEach((el, i) => {
    const live = vivos[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined;
    if (!live) return;
    if (el.tagName === "SELECT") {
      const sel = el as HTMLSelectElement;
      Array.from(sel.options).forEach((o) => {
        if (o.value === (live as HTMLSelectElement).value) o.setAttribute("selected", "selected");
        else o.removeAttribute("selected");
      });
    } else {
      const node = el as HTMLInputElement;
      const lv = live as HTMLInputElement;
      if (node.type === "checkbox" || node.type === "radio") {
        if (lv.checked) node.setAttribute("checked", "checked");
        else node.removeAttribute("checked");
      } else {
        node.setAttribute("value", lv.value ?? "");
        if (node.tagName === "TEXTAREA") node.textContent = lv.value ?? "";
      }
    }
  });
  clone.querySelectorAll("input, select, textarea, button").forEach((el) => {
    el.setAttribute("disabled", "true");
    el.setAttribute("data-export-inert", "1");
  });

  // Tabelas ordenáveis e filtráveis offline no arquivo exportado
  clone.querySelectorAll("table").forEach((t) => {
    t.setAttribute("data-sortable", "1");
    t.setAttribute("data-filterable", "1");
  });
}


const RUNTIME_JS = `
(function () {
  function texto(td) { return (td ? td.textContent : "").trim(); }
  function numero(v) {
    var n = v.replace(/[^0-9,.-]/g, "").replace(/\\./g, "").replace(",", ".");
    var f = parseFloat(n);
    return isNaN(f) ? null : f;
  }
  // Filtro de busca funcional (offline) acima de cada tabela exportada
  document.querySelectorAll('table[data-filterable]').forEach(function (table) {
    var tbody = table.querySelector('tbody');
    if (!tbody || !tbody.rows.length) return;
    var bar = document.createElement('div');
    bar.className = 'export-filterbar';
    var input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Filtrar nesta tabela...';
    var info = document.createElement('span');
    info.className = 'export-filterinfo';
    function atualizar() {
      var termo = input.value.trim().toLowerCase();
      var visiveis = 0;
      Array.prototype.slice.call(tbody.rows).forEach(function (r) {
        var ok = !termo || (r.textContent || '').toLowerCase().indexOf(termo) !== -1;
        r.style.display = ok ? '' : 'none';
        if (ok) visiveis++;
      });
      info.textContent = visiveis + ' de ' + tbody.rows.length + ' linhas';
    }
    input.addEventListener('input', atualizar);
    bar.appendChild(input);
    bar.appendChild(info);
    if (table.parentNode) table.parentNode.insertBefore(bar, table);
    atualizar();
  });
  document.querySelectorAll('table[data-sortable]').forEach(function (table) {

    var ths = table.querySelectorAll('thead th');
    ths.forEach(function (th, idx) {
      th.style.cursor = 'pointer';
      th.title = 'Clique para ordenar';
      var asc = true;
      th.addEventListener('click', function () {
        var tbody = table.querySelector('tbody');
        if (!tbody) return;
        var rows = Array.prototype.slice.call(tbody.rows);
        rows.sort(function (a, b) {
          var x = texto(a.cells[idx]), y = texto(b.cells[idx]);
          var nx = numero(x), ny = numero(y);
          var r = (nx !== null && ny !== null) ? nx - ny : x.localeCompare(y, 'pt-BR');
          return asc ? r : -r;
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
        asc = !asc;
      });
    });
  });
  var tip = document.createElement('div');
  tip.className = 'export-tip';
  document.body.appendChild(tip);
  function mostrar(e, txt) {
    tip.textContent = txt;
    tip.style.display = 'block';
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
  }
  document.querySelectorAll('svg .recharts-layer, svg [data-export-tip]').forEach(function (el) {
    var txt = el.getAttribute('data-export-tip') || el.getAttribute('name') || '';
    if (!txt) return;
    el.addEventListener('mousemove', function (e) { mostrar(e, txt); });
    el.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
  });
  document.querySelectorAll('[data-export-collapsible]').forEach(function (sec) {
    var head = sec.querySelector('[data-export-collapsible-header]') || sec.firstElementChild;
    if (!head) return;
    head.style.cursor = 'pointer';
    head.addEventListener('click', function () {
      sec.classList.toggle('export-collapsed');
    });
  });
})();
`;

export async function exportarDashboardHtml({ titulo, elemento, filtros = [], usuario }: ExportarHtmlParams) {
  const clone = elemento.cloneNode(true) as HTMLElement;
  limparClone(clone);

  const tema = document.documentElement.getAttribute("data-theme") ?? "atual";
  const dark = document.documentElement.classList.contains("dark");
  const agora = new Date();
  const carimbo = agora.toLocaleString("pt-BR");

  const chips = filtros
    .filter((f) => f.valor)
    .map((f) => `<span class="export-chip"><b>${escapar(f.label)}:</b> ${escapar(f.valor)}</span>`)
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR" data-theme="${tema}"${dark ? ' class="dark"' : ""}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapar(titulo)} — ${carimbo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&display=swap" />
<style>${coletarCss()}</style>
<style>${variaveisDoTema()}</style>
<style>
  body { margin: 0; padding: 24px; background: var(--background); color: var(--foreground); }
  .export-header { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
  .export-header h1 { margin: 0 0 6px; font-size: 28px; font-weight: 700; }
  .export-meta { font-size: 13px; opacity: .75; }
  .export-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .export-chip { font-size: 12px; padding: 4px 10px; border-radius: 999px; background: var(--muted); color: var(--foreground); border: 1px solid var(--border); }
  .export-tip { position: fixed; display: none; z-index: 9999; pointer-events: none; font-size: 12px;
    padding: 6px 10px; border-radius: 8px; background: var(--popover); color: var(--popover-foreground);
    border: 1px solid var(--border); box-shadow: 0 6px 20px -8px rgb(0 0 0 / 35%); }
  .export-collapsed > *:not(:first-child) { display: none; }
  table[data-sortable] th:hover { text-decoration: underline; }
  .export-footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 11px; opacity: .6; }
</style>
</head>
<body>
  <div class="export-header">
    <h1>${escapar(titulo)}</h1>
    <div class="export-meta">Exportado em ${carimbo}${usuario ? ` · por ${escapar(usuario)}` : ""}</div>
    ${chips ? `<div class="export-chips">${chips}</div>` : ""}
  </div>
  ${clone.outerHTML}
  <div class="export-footer">Snapshot estático gerado pelo sistema Mágio — sem conexão com o banco de dados.</div>
  <script>${RUNTIME_JS}<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(titulo)}_${stamp(agora)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function escapar(s: string) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
