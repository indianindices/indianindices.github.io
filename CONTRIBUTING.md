# Contributing

Contributions to Indian Sectors are welcome: bug reports, data-quality fixes,
accessibility improvements, documentation and focused dashboard features.
For a substantial feature or new data source, open an issue first to discuss
the scope and calculation methodology.

## Local setup

Use Python 3.12 (the version used by CI), Node.js 18 or newer for the regression
tests, and a modern browser. No npm install or frontend build step is needed.

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
Use `PORT=9000 ./dev.sh` if port 8000 is occupied. Run `./dev.sh --refresh`
only when testing source-data changes; it fetches external data and rewrites
the workbook. Do not include unrelated workbook changes in a pull request.

## Where to make changes

- [index.html](index.html): page structure and controls.
- [style.css](style.css): responsive layout and styling.
- [app.js](app.js): charts, navigation and return calculations.
- [build_sectoraldata.py](build_sectoraldata.py): public data fetching and workbook generation.
- [export_data.py](export_data.py): website data export and unfinished-quarter handling.
- [tests/app.test.cjs](tests/app.test.cjs): focused JavaScript regression tests.
- [tests/test_refresh.py](tests/test_refresh.py): isolated refresh metadata and export tests.
- [.github/workflows/update-data.yml](.github/workflows/update-data.yml): refresh and Pages deployment.

## Checks before a pull request

```bash
node --test tests/app.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
git diff --check
git status --short
```

For UI changes, check desktop and mobile widths, keyboard navigation, asset
pages, Summary and Compare. Check annual returns, growth, excess returns and
rolling CAGR, individual selections, All/None, date ranges, tooltips and CSV
export. Check drawdown/recovery values and risk tables, ranking sort direction
and missing values, and PNG exports from all three chart views. Verify PNG
images contain the current viewport and visible-series legend, not just an empty
canvas. Check shared links after reload and browser Back/Forward navigation.
Include screenshots for visual changes and regression tests for changed logic.

## Data and security

- Cite sources and describe any changed calculation or assumptions.
- Preserve missing values; never invent returns or treat missing quarters as zero.
- Distinguish current-year YTD from completed calendar years. Growth comparisons
  must use a shared starting balance and uninterrupted quarterly history.
- Curved chart lines are visual interpolation, not additional observations.
- Keep `_RefreshStatus` separate from index return sheets. Preserve the last
  successful refresh date when a fetch fails; exporting data is not a refresh.
  Pipeline tests use temporary workbooks and mocked requests, not live fetching.
- Keep data fetching respectful of source terms and rate limits. Do not bypass authentication.
- Never commit API keys, cookies, tokens, private keys or personal financial data.
  Report credential exposures privately to a maintainer, not in a public issue.
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