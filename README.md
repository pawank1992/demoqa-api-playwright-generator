# DemoQA API Playwright Generator

Spec-driven API automation framework that converts an OpenAPI/Swagger specification into executable Playwright API tests.

## One-command execution

```bash
npm install
npx playwright install
npm run api:test
```

The command:

1. Reads `specs/demoqa.yaml` (or `OPENAPI_SPEC` if supplied).
2. Validates and dereferences the OpenAPI document.
3. Generates `generated/api.generated.spec.js`.
4. Runs the generated tests with Playwright.
5. Produces an HTML report in `playwright-report/`.

Open the report with:

```bash
npm run report
```

## Use another specification

PowerShell:

```powershell
$env:OPENAPI_SPEC="specs/my-api.yaml"
npm run api:test
```

Linux/macOS:

```bash
OPENAPI_SPEC=specs/my-api.yaml npm run api:test
```

## Architecture

```text
OpenAPI / Swagger
      |
      v
Swagger Parser
      |
      v
Test Generator
      |
      v
Playwright .spec.js
      |
      v
APIRequestContext
      |
      v
HTML Report
```

## Notes

This first version deliberately keeps generation deterministic and specification-driven. The next iterations can add schema-aware negative cases, parameter boundary tests, authentication handling, reusable test data, richer assertions, and optional AI-assisted scenario design.

DemoQA: https://demoqa.com/swagger
