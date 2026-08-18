# DemoQA API Playwright Generator

Spec-driven API automation framework that converts an OpenAPI/Swagger specification into executable Playwright API tests.

## Coverage generated from the specification

For each operation, the generator evaluates the rules available in the OpenAPI document and generates applicable tests for:

- Positive / happy-path requests
- Expected 2xx status
- Response content type
- Response contract / required properties
- No unexpected 5xx server errors
- Missing required request-body fields
- Invalid request data types
- Required query-parameter validation
- Invalid path-parameter validation
- `minimum` / `maximum` / `minLength` / `maxLength` / `minItems` / `maxItems` boundary values
- Enum and format-aware example data
- GET, POST, PUT, PATCH, DELETE, HEAD and OPTIONS operations

Tests are generated only when the corresponding information exists in the supplied OpenAPI specification. This prevents the framework from inventing constraints that the contract does not define.

## One-click execution

```bash
npm install
npx playwright install
npm run api:test
```

The command:

1. Reads `specs/demoqa.yaml` or `OPENAPI_SPEC`.
2. Validates and dereferences the OpenAPI document.
3. Generates `generated/api.generated.spec.js`.
4. Generates `generated/test-manifest.json` with the test inventory and category counts.
5. Runs the generated tests with Playwright.
6. Produces an HTML report in `playwright-report/`.

Open the report:

```bash
npm run report
```

## GitHub Actions

Every push/PR to `main` and manual **Run workflow** execute the generator and Playwright tests. The HTML report is uploaded as a workflow artifact.

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
Swagger Parser + dereference
      |
      v
Contract-aware Test Designer
      |
      +---- Positive
      +---- Negative
      +---- Boundary
      +---- Contract
      |
      v
Playwright .spec.js
      |
      v
APIRequestContext
      |
      v
HTML Report + Test Manifest
```

## DemoQA

Swagger UI: https://demoqa.com/swagger

The checked-in YAML is a deterministic seed specification for the framework. For a different API, replace it with the API's actual OpenAPI JSON/YAML document and run `npm run api:test`.
