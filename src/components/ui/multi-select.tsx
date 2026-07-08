import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type MultiOption = { value: string; label: string };

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Selecionar…",
  emptyLabel = "Nada encontrado",
  allLabel = "Todos",
  className,
}: {
  options: MultiOption[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  allLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between h-auto min-h-9 py-1.5", className)}
        >
          <div className="flex flex-wrap gap-1 items-center">
            {value.length === 0 && (
              <Badge variant="secondary" className="text-[10px]">{allLabel}</Badge>
            )}
            {value.slice(0, 3).map((v) => {
              const opt = options.find((o) => o.value === v);
              return (
                <Badge key={v} variant="outline" className="text-[10px] gap-1">
                  {opt?.label ?? v}
                  <X
                    className="size-3 cursor-pointer opacity-60 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); toggle(v); }}
                  />
                </Badge>
              );
            })}
            {value.length > 3 && (
              <Badge variant="secondary" className="text-[10px]">+{value.length - 3}</Badge>
            )}
          </div>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const sel = value.includes(o.value);
                return (
                  <CommandItem key={o.value} value={`${o.value} ${o.label}`} onSelect={() => toggle(o.value)}>
                    <Check className={cn("mr-2 size-4", sel ? "opacity-100" : "opacity-0")} />
                    {o.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
