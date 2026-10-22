# Design notes: where the code must differ from the Stitch exports

The exported screens are layout and style references. Where they disagree with
this file, DESIGN.md or docs/SPEC.md, follow this file and the spec.

## Console
- Purpose chips are never truncated. Labels: "Matched", "Credited to someone else",
  "Ticket not found", "No case", "No failed transaction", "Partial", "Duplicate".
- Add a right-aligned POINTS column after Purpose check (e.g. +26, +10, +38;
  zero shown as muted "+0"). Points come from the API, never hardcoded.
- Remove "Realtime Telemetry" and the Flagged count badge if they crowd the header.

## Case view
- Top banner text by level: Contain → "Contain · session suspension waiting for
  your approval"; Hold → "Hold · funds hold waiting for your approval". Hide when
  nothing is pending.
- R4 row title: "R4 Credit returned to the debited account", detail line below.

## Money graph
- Exactly one solid arrow per credited account (6 in S2). No arrows to empty space.
- Each dashed blocked line ends at its destination bank group.
- Rendered with Cytoscape from GET /api/graph/{case_id}; the export shows the
  look only.

## Shared shell
- Use the top bar and nav rail from the Screen 5/6 exports for every page
  ("Scenario:" label, dividers, newer nav icons). Build them once as shared
  components; older exports are layout references only.
- Numbers use tabular figures (`font-variant-numeric: tabular-nums`).
  Monospace only inside ticket/ID input fields.

## Screens with no export
Staff view, Metrics and the AI-agent case were never generated in Stitch. Build
them from DESIGN.md and docs/SPEC.md; every number comes from the API.

## All screens
- Ignore any value in the exports that is not in docs/SPEC.md or the sample data
  (e.g. "Accelerated risk delta", "Access Window: 72 hrs", "Horizon … audit period").
  Use only values from the API.
- Bank names are fictional (Bank A to F). Never real banks.
- Next step is disabled with "Waiting for analyst decision" whenever an
  intervention is pending.
