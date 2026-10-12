# Contributing

This project is public and source-available under PolyForm Noncommercial 1.0.0,
not OSI-approved open source. Read [LICENSE](LICENSE) and preserve [NOTICE](NOTICE).
Submit only work you own or have permission to contribute. Unless separately
agreed in writing, contributions are offered under the same project license;
contributors retain their copyright. Commercial relicensing of third-party
contributions requires appropriate permission or a separate contributor agreement.
Technical process and calculation details are in [docs/METHOD.md](docs/METHOD.md).

Contributions to Indian Sectors are welcome: bug reports, data-quality fixes,
accessibility improvements, documentation and focused dashboard features.
For a substantial feature or new data source, open an issue first to discuss
the scope and calculation methodology.

## Local setup

Use Python 3.12 (the version used by CI), Node.js 22 or newer for public
configuration and regression tests, and a modern browser. No npm install is needed.

Fork the repository on GitHub, then run:

```bash
git clone https://github.com/YOUR_USERNAME/indianindices.github.io.git
cd indianindices.github.io
git switch -c feature/short-description
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
./dev.sh
```

Open http://localhost:8000. The script exports the existing workbook to
`data.json` before serving the dashboard. Stop it with Ctrl+C.
Raw CSV and Excel data are stored in `data/`; the saved workbook is
`data/sectoraldata.xlsx`. The generated JSON stays at the site root.
Use `PORT=9000 ./dev.sh` if port 8000 is occupied. Run `./dev.sh --refresh`
only when testing source-data changes; it fetches external data and rewrites
the workbook. Do not include unrelated workbook changes in a pull request.

## Where to make changes

- [index.html](index.html): page structure and controls.
- [ui-config.js](ui-config.js): top-level and subsection visibility switches.
- [style.css](style.css): responsive layout and styling.
- [app.js](app.js): charts, navigation and return calculations.
- [analytics.js](analytics.js): pure monthly Research calculations.
- [research.js](research.js): Research views and exports.
- [finance-calculations.js](finance-calculations.js): library-backed projection math.
- [calculator.js](calculator.js): SIP/LumpSum/SWP controls, graphs and exports.
- [tests/calculator.test.cjs](tests/calculator.test.cjs): timing, compounding and depletion tests.
- [tests/analytics.test.cjs](tests/analytics.test.cjs): known-result Research regression tests.
- [build_sectoraldata.py](build_sectoraldata.py): public data fetching and workbook generation.
- [export_data.py](export_data.py): website data export and unfinished-quarter handling.
- [tests/app.test.cjs](tests/app.test.cjs): focused JavaScript regression tests.
- [tests/test_refresh.py](tests/test_refresh.py): isolated refresh metadata and export tests.
- [.github/workflows/update-data.yml](.github/workflows/update-data.yml): refresh and Pages deployment.

## Checks before a pull request

```bash
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
git diff --check
git status --short
```

For UI changes, check desktop and mobile widths, keyboard navigation, asset
pages, all three Market Overview tabs (CAGR, Annual heatmap, Annual returns), and Compare.
Check tab keyboard navigation and heatmap year selection without changing
asset/comparison ranges. Check annual returns, growth, excess returns and
rolling CAGR, individual selections, All/None, date ranges, tooltips and CSV
export. Check drawdown/recovery values and risk tables, ranking sort direction
and missing values, and PNG exports from all three chart views. Verify PNG
images contain the current viewport and visible-series legend, not just an empty
canvas. Check shared links after reload and browser Back/Forward navigation.
Include screenshots for visual changes and regression tests for changed logic.
Check all three Research views, invalid/blank dates and weights, sample limits,
rolling-window filters, calendar rebalancing, costs, correlations and CSV/PNG
exports. Verify the source return basis is disclosed rather than assumed to be TRI.
Research defaults off in the UI config; enable it locally to test those views.
Check disabled-section URLs, hidden-tab keyboard navigation, first-enabled-tab
fallback, and the all-views-disabled state. Restore the intended config before
including it in a pull request. Visibility settings are not authorization.
Check calculator decimal/zero/negative returns, annual step-ups, contribution
timing, SWP depletion, invalid fields, sliders, per-mode settings, yearly cash-flow
tables, CSV/PNG captions and config-disabled calculator links. Preserve the
financial library's MIT license and public staging entries.

## Data and security

- Cite sources and describe any changed calculation or assumptions.
- Preserve missing values; never invent returns or treat missing quarters as zero.
- Research must not fill monthly gaps or calculate correlations on mismatched
  samples. Preserve the bundled statistics license and stage every Research asset.
- Distinguish current-year YTD from completed calendar years. Growth comparisons
  must use a shared starting balance and uninterrupted quarterly history.
- Curved chart lines are visual interpolation, not additional observations.
- Keep `_RefreshStatus` separate from index return sheets. Preserve the last
  successful refresh date when a fetch fails; exporting data is not a refresh.
  Pipeline tests use temporary workbooks and mocked requests, not live fetching.
- Keep data fetching respectful of source terms and rate limits. Do not bypass authentication.
- Never commit API keys, cookies, tokens, private keys or personal financial data.
  Report credential exposures privately to a maintainer, not in a public issue.
- Supabase's publishable/legacy anon key is intentionally browser-visible. Never
  use a secret or service-role key. Preserve waitlist RLS and write-only RPC permissions;
  use the private Supabase dashboard for signup data and metrics.
- Generated JSON and local environment files are ignored; do not force-add them.
- If adding a site asset, include it in the Pages workflow's staging step.

## Submitting changes

Keep each pull request focused. Explain the problem, the approach and the
checks run, including limitations. Update documentation when behavior changes.
Push your feature branch to your fork and open a pull request against `main`.
CI on `main` refreshes data and deploys Pages; contributors should run the
checks locally rather than assume a pull-request workflow will run them.

For bug reports, include the page URL, browser, reproduction steps, expected
and actual results, and a screenshot or console error when useful. Remove
secrets and personal information before posting.