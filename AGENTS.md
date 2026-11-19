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
- Divergence evidence carries a typed link to its source record (write-off, receipt note, mission, inventory, divergence, OP) that opens in a new tab through optional search params, keeping the analysis open and never altering data.
- Confirming a counting pendency closes an overdue mission (≥1 day after its execution date, São Paulo time) through a manager-only database RPC that records who/when/why; such missions stay in Inventory Indicator adherence as not performed so closing never inflates the metric.
- Partner itineraries: route order and km come only from the server-side OSRM trip calculation starting at the factory origin (a DB trigger discards km from non-managers), and users linked to a provider are confined to the provider portal, so mileage cannot be typed or inflated.
- Transport quote requests may be deleted only by the roles the database treats as management, and a request that already generated a service order is refused by a database trigger, because the quote and order links cascade and a single delete would otherwise erase the order and its history.
- Provider-portal confinement is evaluated only after the user's role has loaded and never applies to administrators or managers, so a manager whose account is also linked to a provider is not bounced out of the screen they are working on.
- AI market freight estimates live in their own table, generated only on explicit user action through an authenticated server function and stored per request; they never count toward the three-quote rule or create service orders, and reach a real quote only when a user copies one into the manual quote form, so unverified prices cannot drive approvals.
- Itinerary cancellation is final and enforced by the itinerary database trigger (reason required, reopen/recalculate/finalize refused, partners cannot cancel finished runs); canceled routes keep their stored km for audit but count as zero, so wrong routes never inflate mileage.
- Requisition separation runs only through the `separar_requisicao` database RPC, authorized by role or the Requisições permission-matrix entry and scoped to the user's warehouses, so separators never get direct stock-write access and item, stock, status and audit updates stay atomic.
- Replenishment screens (availability dashboard, stock overview, store replenishment, orders) open to gestores/Control Coordinator by role and to other profiles through the permission matrix, enforced by matrix-aware RLS and RPCs; matrix operators move orders only to Separated (without a requisition), Shipped and Received within their warehouses, while commercial approval, cancellation, item edits and order creation keep their original guards, and open write-offs reach replenishment only through an aggregated RPC so private write-off details stay hidden.
- Transport client registry (log_clientes) is filled automatically from saved request addresses, keyed by normalized name + CEP (DB generated column), so re-saving updates the same record and a new CEP adds another address; editing a request recalculates only table-origin quotes, never manual or edited ones.
