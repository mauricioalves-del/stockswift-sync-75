import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme, THEMES, type ThemeId } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { Check, Palette } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/config/aparencia")({
  component: AparenciaPage,
  head: () => ({
    meta: [
      { title: "Aparência — Temas do sistema" },
      { name: "description", content: "Escolha entre as identidades visuais do sistema Mágio: Atual, Mágio Claro e Mágio Escuro." },
      { property: "og:title", content: "Aparência — Temas do sistema" },
      { property: "og:description", content: "Troque a identidade visual do sistema em tempo real e salve a preferência por usuário." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Miniatura({ id, swatches }: { id: ThemeId; swatches: string[] }) {
  const [c1, c2, c3, c4, c5] = swatches;
  const dark = id === "magio-escuro";
  return (
    <div className="rounded-xl overflow-hidden border border-border" style={{ background: c5 }}>
      <div className="flex h-24">
        <div className="w-1/4" style={{ background: c2 }} />
        <div className="flex-1 p-2 space-y-1.5">
          <div className="h-3 w-2/3 rounded" style={{ background: c1 }} />
          <div className="h-2 w-full rounded" style={{ background: dark ? c3 : c4, opacity: 0.8 }} />
          <div className="h-2 w-4/5 rounded" style={{ background: dark ? c3 : c4, opacity: 0.6 }} />
          <div className="flex gap-1 pt-1">
            <div className="h-4 w-10 rounded-md" style={{ background: c1 }} />
            <div className="h-4 w-10 rounded-md border" style={{ borderColor: c3 }} />
          </div>
        </div>
      </div>
      <div className="flex">
        {swatches.map((c) => (
          <div key={c} className="h-3 flex-1" style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function AparenciaPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Palette className="size-6" /> Aparência
        </h1>
        <p className="text-sm text-muted-foreground">
          Escolha a identidade visual do sistema. A troca é imediata e fica salva na sua conta.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {THEMES.map((t) => {
          const ativo = theme === t.id;
          return (
            <Card
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setTheme(t.id);
                toast.success(`Tema "${t.nome}" aplicado`);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setTheme(t.id);
                }
              }}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                ativo && "ring-2 ring-primary border-primary",
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="truncate">{t.nome}</span>
                  {ativo && <Check className="size-4 text-primary shrink-0" />}
                </CardTitle>
                <CardDescription className="text-xs">{t.descricao}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Miniatura id={t.id} swatches={t.swatches} />
                <Button variant={ativo ? "default" : "outline"} size="sm" className="w-full">
                  {ativo ? "Tema ativo" : "Aplicar tema"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        O ícone de sol/lua no cabeçalho alterna rapidamente entre Mágio Claro e Mágio Escuro. O tema Atual permanece
        disponível apenas nesta tela.
      </p>
    </div>
  );
}
