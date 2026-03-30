# Contributing

## Required merge checks

Pull requests to `main` run two GitHub Actions workflows:

| Workflow        | File                      | What it runs |
|----------------|---------------------------|--------------|
| **PR Check**   | `.github/workflows/pr-check.yml`  | Builds `@percolator/sdk`, shared, api, keeper, indexer, and the Next.js app. Runs package tests for shared, api, keeper, and indexer. **Does not** run the `app` Vitest suite. |
| **Test Suite** | `.github/workflows/test.yml`      | Runs the same package tests **and** `pnpm --filter app test`, plus other jobs defined in that workflow. |

Branch protection should require the **Test Suite** workflow (or its unit-test job) to pass before merging. Treating **PR Check** alone as sufficient can allow merges while frontend unit tests are failing.
