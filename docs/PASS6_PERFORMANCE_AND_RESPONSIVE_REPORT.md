# Pass 6 performance and responsive report

Measured on a Windows host with Node 24.20.0, npm 11.19.0, Next 15.5.9 and the ChatGPT in-app Chromium browser. The machine is shared and development compilation is noisy; small-sample medians are descriptive, not capacity or SLA claims. Every run used disposable business/auth/workspace paths.

## Baseline observations

| Path | Before | Measurement boundary |
|---|---:|---|
| Development server ready | 11.1s | process start to Next “Ready” |
| First `/login` development compile/request | 12.7s | first route request in server log |
| First fresh visitor demo entry | 66.5s server response; UI confirmed by 90.3s | `/api/auth/demo` included deterministic template generation; browser confirmation also included dev compilation and API hydration |
| Warm same-persona reload | 2.83–4.71s (median 2.87s, n=3) | reload to console plus verified session controls visible |
| Console → Cases → Console | Cases 0.06–0.50s; Console 1.22–1.89s (n=3) | client navigation to visible static heading/feed |
| Warm console API | commonly 0.30–0.60s before the projection cache | Next development server log; occasional compilation outliers excluded from warm description |

The first visitor was dominated by `resetDemo` calling `seedDatabase` to generate ~181k actions plus purpose results, peer statistics and historical scores (`src/server/services/demo.ts`, `src/server/sim/seed.ts`, `src/server/sim/generator.ts`, `src/server/engines/pipeline.ts`). This is deterministic setup work, not SQLite query latency for ordinary navigation.

The browser also issued three simultaneous `/api/auth/session` requests on a console mount because `TopBar`, `NavRail` and the page each mounted `useSession`. Development Strict Mode and mutation refreshes could overlap identical poll requests. Finally, the shell measured 736px wide in a 360px viewport and 1,638px wide at desktop widths up to 1,440px, caused by an unwrapped top bar plus min-content tables/grid children.

## Changes

1. `scripts/prepare-demo-template.ts` and `prepareDemoWorkspaceTemplate` prepare the deterministic immutable seed before the server accepts visitors. The first click now copies that template and rotates a run ID; workspace isolation is unchanged.
2. `src/lib/client.ts` deduplicates concurrent session probes and identical in-flight polling reads, rejects responses from a previous account generation, and prevents overlapping requests per hook. Polling moved to 2.5s for the header and 3s for console/case/operator views; every local mutation still refreshes immediately.
3. `src/server/services/read.ts` caches the console projection per actual workspace database handle until material clock, evidence, score, case or intervention state changes. No cross-workspace/global data projection cache exists.
4. `src/app/globals.css`, shell/components and page table wrappers remove page-level overflow, collapse two-column content, move navigation to the bottom on phones, keep controls reachable, and provide labelled scroll regions for intrinsically wide evidence.
5. Loading/error/retry states were added to the account picker, console, case list, operator actions and graph. Dialog semantics, keyboard focus indication, Escape close and reduced-motion support were added without changing risk/security rules.

## Responsive verification

Before: page-level horizontal overflow at all six target sizes. After: `documentElement.scrollWidth === clientWidth` at 360×800, 390×844, 768×1024, 1024×768, 1440×900 and 1366×650 on the presenter console. Wide tables and the 1,100px money graph retain their evidence inside keyboard-focusable horizontal regions instead of widening the page.

| Area | Phone | Tablet | Desktop / short height |
|---|---|---|---|
| Account picker | one-column cards, full-width Enter button | two columns | four columns |
| Top bar | non-sticky wrapped context/actions; full-width scenario | two wrapped rows | wrapped only as needed; no page overflow |
| Navigation | fixed bottom nav with labelled icons | left rail | left rail |
| Console/case grids | one column | one column | two columns from 1180px |
| Tables | labelled/pannable region | pannable when required | full width where space permits |
| Score steps | contained horizontal scale | contained | full card |
| Money graph | explicit pan affordance and labelled region | pannable | full 1,100px canvas |
| Dialog | bottom-aligned, viewport height scroll | centred | centred |
| Keyboard | visible focus, semantic buttons/links, table/graph focus regions | same | same |

## After measurements

| Path | After | Comparable interpretation |
|---|---:|---|
| Template preparation | 97.3s on the shared development host | Explicit pre-start work; it no longer blocks a visitor click. A second idempotent invocation took 17.2s including `tsx` startup on the busy host. |
| Prepared first visitor, development | 4.36s server response | Down from 66.5s (93% reduction). The browser still waited on first-route development compilation, which is not production behavior. |
| Warm same-persona reload, development | 0.64–1.53s (median 0.69s, n=3) | Down from median 2.87s under the same browser/tooling, although the shared machine remains noisy. |
| Warm account switch, development | 1.84–2.62s (median 2.28s, n=3) before removal of a redundant refresh; server POST later measured 0.10–0.26s | Browser timing includes Next development navigation. The redundant `router.refresh()` after `router.replace()` was removed; no automatic stale retry was introduced. |
| Production server ready | 2.5s | Fresh `next start` process using the isolated build. |
| Prepared first visitor, production | 1.02s | Fresh disposable auth store; template already prepared. |
| First production root | 0.10s | HTTP response after session issue; browser rendering was not separately available on port 3114 because the in-app browser policy blocked that port. |
| Production console | 2.40s cold projection, then 14–17ms (n=3) | First request opens/builds the per-workspace projection; subsequent material-state-identical reads use the scoped cache. |
| Production root, warm | 6–8ms (median 7ms, n=3) | Loopback HTTP measurement. |
| Production next visitor / persona switch | 160ms / 46ms | Separate disposable WebRequest session; server response only. |

The three measured bottlenecks were: deterministic seed generation during first visitor entry (`src/server/services/demo.ts`), duplicate session/poll reads (`src/lib/client.ts`), and synchronous repeated console projection work (`src/server/services/read.ts`). Development route compilation remained the largest visible outlier during automated rehearsal, including 8–53s first-route compiles on the heavily loaded shared host; it is a tooling cost and was not described as application query latency.

## Limits

No dependency, detection rule, score, threshold, review policy, permission or frozen evaluation artifact changed. These measurements do not establish production throughput, concurrent SQLite behavior, bank latency, fraud accuracy or reviewer-time savings. Browser automation had one in-app browser profile; independent visitor isolation remains primarily route/test verified unless two browser contexts are explicitly available.
