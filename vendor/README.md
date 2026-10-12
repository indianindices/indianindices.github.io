# Bundled statistics

These are third-party runtime dependencies, not original IndianIndices code.
Their respective licenses remain unchanged by the project's PolyForm Noncommercial [LICENSE](../LICENSE).
Keep both `.min.js` bundles and both `.LICENSE` notices: the site and Node tests
load the bundles, and deployment stages the license notices. This README records
provenance and rebuild instructions; it is not a runtime dependency.

`simple-statistics.min.js` is the unmodified browser bundle from
`simple-statistics@7.8.8` (https://github.com/simple-statistics/simple-statistics).
Its ISC license is preserved in `simple-statistics.LICENSE`.

The research tools use its sample correlation, sum and sample standard deviation.
Bundling it keeps research calculations independent of a third-party CDN.

## Financial calculations

`financial.min.js` bundles `financial@0.2.4`, a JavaScript port of numpy-financial,
from https://github.com/lmammino/financial. Its MIT license is preserved in
`financial.LICENSE`. Calculators use its `fv` function and payment-timing constants.

The browser/CommonJS bundle was built from `dist/financial.esm.js` using
`esbuild@0.25.12` with `--bundle --format=iife --global-name=FinancialMath --minify
--target=es2020` and a CommonJS export footer. Local application startup does not
require npm installation.