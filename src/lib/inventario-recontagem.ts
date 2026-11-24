type DuplaRecontagem = { key: string; conta: boolean; reconta: boolean; recontadaPor: string };

/** Sem outra dupla selecionada, o responsável original também faz a recontagem. */
export function destinoRecontagem(dupla: DuplaRecontagem): string {
  return dupla.recontadaPor || dupla.key;
}

export function recontagemValida(dupla: DuplaRecontagem, duplas: readonly DuplaRecontagem[]): boolean {
  const destino = destinoRecontagem(dupla);
  return destino === dupla.key || duplas.some((d) => d.key === destino && d.reconta);
}

export function participaRecontagem(dupla: DuplaRecontagem, duplas: readonly DuplaRecontagem[]): boolean {
  return dupla.reconta || duplas.some((d) => d.conta && destinoRecontagem(d) === dupla.key);
}