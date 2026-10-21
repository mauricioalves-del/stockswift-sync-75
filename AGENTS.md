<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Access to write-off reasons, FEFO checks, and dispersion comments is bounded by a restrictive SELECT policy requiring an explicitly approved profile, so permissive sibling policies cannot bypass approval.
- Hosted access regression tests use a locally minted approved session and never store or print its credentials.
- Portfolio classification is an append-only ledger separate from ABC; authenticated database RPCs atomically validate imports and derive the author from the session to prevent partial writes and unauthorized reclassification.
- Replenishment displays portfolio classes from the same immutable approved snapshot used for each store's SKU list, never from current classification or ABC, to preserve approval provenance.
- Order status rollback uses an admin-validated database RPC and a transition stack; it audits the previous order and synchronizes linked requisitions to prevent approval bypass and duplicate active requests.
- Commercial suggestion quantities use the shared validation helper with a per-item fractioning flag; fractioning bypasses only case multiples, never stock limits or director approval.
