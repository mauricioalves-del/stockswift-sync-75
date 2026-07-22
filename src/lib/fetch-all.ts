// Paginated fetch helper: PostgREST caps at ~1000 rows per request regardless
// of a client-side .limit(). Use this to reliably fetch the entire result set.
// Usage: const rows = await fetchAll((from, to) => supabase.from("t").select("...").range(from, to));

const PAGE = 1000;

export async function fetchAll<T = any>(
  build: (from: number, to: number) => any,
  maxRows = 100_000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const to = from + PAGE - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}
