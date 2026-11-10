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
- Commercial approval atomically accepts validated extras and generates the separation requisition; legacy director-pending orders remain commercial-actionable and rollback skips the retired director stage. Per-item fractioning bypasses only case multiples, never stock limits.
- Order extras combine the approved store portfolio with explicitly allowed operational supply groups in both UI and transactional approval, without adding supplies to the planning portfolio.
- Replenishment product descriptions (orders, order extras, replenishment items) prefer the native stock system name keyed by trimmed SKU without leading zeros, falling back to stored/registered names; a repeated SKU is not a name, so outdated catalog labels never override the system description.
- Replenishment opts into pending operational write-off deductions by normalized SKU and exact warehouse; source balance validation repeats in database triggers, while availability snapshots remain unchanged.
- Daily rupture drill-down loads the selected SKUs' full snapshot history on demand; resolution dates come from snapshots, while live stock changes only displayed status, never historical photos.
- Atlas panels use shared chart presentation with Atlas-specific semantic palette tokens and existing computed datasets, keeping reference chart formatting independent of business calculations.
- Atlas accuracy forecasts use least-squares regression over all valid filtered daily observations with calendar-day distances and five calendar-day predictions bounded to 0–100%, keeping observed data unchanged and showing insufficient history without invented estimates.
- Pre-inventory pending counts come from the existing database function and are regression-checked against authenticated operational reads, keeping checklist preparation separate from operational records.
- Write-off cost centers are derived by a database trigger for every insertion path and reference-changing update, never trusted from client input; unrelated updates preserve the original allocation and configuration changes do not rewrite history. Warehouse mapping uses the operational origins catalog, not Atlas mappings.
- Integration-plan action editing reuses existing action records and manager permissions; destinations preserve internal query/hash navigation and allow only HTTP(S) external URLs to avoid executable links.
- Caixaria catalog lists only approved items: the store's approved portfolio (consensus fallback), unioned across stores in the all-stores view; exposure records never add items to the list. Categories come from the native category register by normalized SKU, without changing replenishment family rules or shared box sizes.
- Mission transit is a paginated read of pending, non-canceled transfer notes matched by normalized SKU and destination warehouse; it is display-only to preserve frozen system balances and counting calculations.
- Mission consumption write-offs are admin-only Uso e Consumo requests built per SKU+lot from frozen system minus counted, net of queued and mission-tagged write-offs; transit only forces manual confirmation, so counts before note entry never inflate adjustments.
