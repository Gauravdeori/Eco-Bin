# EcoBin — technical report

`EcoBin-Report.tex` is the full technical report: architecture, the four
algorithms with their measured output, sensor-fusion rules, the automation
pipeline, verification results and scope.

## Building it

Nothing beyond a standard TeX distribution is needed — no custom fonts, no
external images, no shell-escape. Every diagram is drawn in TikZ/pgfplots
inside the document.

### Overleaf (easiest)

1. New Project → Upload Project → upload `EcoBin-Report.tex`.
2. Set the compiler to **pdfLaTeX** (Menu → Compiler).
3. Recompile twice so the table of contents resolves.

### Locally

```sh
pdflatex EcoBin-Report.tex
pdflatex EcoBin-Report.tex     # second pass fills in the contents page
```

With `latexmk` installed, `latexmk -pdf EcoBin-Report.tex` handles both passes.

## Packages used

All ship with TeX Live and MiKTeX:

```
lmodern      microtype   geometry    graphicx    booktabs
tabularx     multirow    xcolor      tikz        pgfplots
amsmath      enumitem    fancyhdr    caption     textcomp    hyperref
```

TikZ libraries: `positioning`, `arrows.meta`, `calc`, `shapes.geometric`,
`fit`, `backgrounds`. pgfplots runs at `compat=1.18`.

## Contents

| § | Section | Contains |
|--:|---------|----------|
| 1 | Abstract | The result in one page |
| 2 | Problem statement | Why fill sensors alone don't solve it |
| 3 | System architecture | Pipeline diagram; why the last hop is a subscription |
| 4 | Priority ranking | Scoring table, fill-rate chart, verified ranking |
| 5 | Fleet partitioning | Sweep diagram, rotation search, capacity handling |
| 6 | Route optimisation | Double-seeded 2-opt, distance chart, provider comparison |
| 7 | Emissions model | The arithmetic, worked |
| 8 | Sensor integrity | Load-cell hold, with timeline chart |
| 9 | Automation and dispatch | Decision flowchart, guards, idempotence, lifecycle |
| 10 | Implementation | Stack, source layout, operator surface |
| 11 | Verification | Seven defects found by testing |
| 12 | Scope | Real vs simulated, stated plainly |
| 13 | Future work | Driver app, hardened rules, prediction, telematics |
| 14 | Conclusion | |

Six TikZ figures, ten tables.

## Editing

Two values you may want to change before submitting:

- **Annualised CO₂** (§6) assumes three runs per day. Adjust if your pilot differs.
- **Deployment location** on the title page.

The palette is defined at the top of the file (`accent`, `crit`, `high`,
`med`, `low`) and matches the dashboard's own severity colours.
