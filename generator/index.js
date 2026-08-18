const fs = require('fs');
const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');

const specPath = process.env.OPENAPI_SPEC || path.resolve('specs/demoqa.yaml');
const outputPath = path.resolve('generated/api.generated.spec.js');

function safeName(value) {
  return String(value || 'operation')
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '') || 'operation';
}

function exampleFromSchema(schema = {}) {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(schema.properties || {})) {
      result[key] = exampleFromSchema(value);
    }
    return result;
  }
  if (schema.type === 'array') return [exampleFromSchema(schema.items || {})];
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 1;
  if (schema.type === 'boolean') return true;
  return 'generated-value';
}

function requestBody(operation) {
  const content = operation.requestBody?.content;
  if (!content) return null;
  const media = content['application/json'] || Object.values(content)[0];
  if (!media) return null;
  return media.example ?? exampleFromSchema(media.schema || {});
}

function expectedStatus(responses) {
  const codes = Object.keys(responses || {}).filter(code => /^2\d\d$/.test(code));
  return Number(codes[0] || 200);
}

async function main() {
  const api = await SwaggerParser.dereference(specPath);
  const baseUrl = api.servers?.[0]?.url || process.env.BASE_URL || 'https://demoqa.com';
  const tests = [];

  for (const [route, pathItem] of Object.entries(api.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
      const name = operation.operationId || `${method}_${route}`;
      const status = expectedStatus(operation.responses);
      const body = requestBody(operation);
      const bodyText = body == null ? '' : `\n    data: ${JSON.stringify(body, null, 2)},`;

      tests.push(`test(${JSON.stringify(`${method.toUpperCase()} ${route} - expected ${status}`)}, async ({ request }) => {\n  const response = await request.${method}(${JSON.stringify(route)}, {${bodyText}\n  });\n  expect(response.status()).toBe(${status});\n});`);

      tests.push(`test(${JSON.stringify(`${method.toUpperCase()} ${route} - response is not server error`)}, async ({ request }) => {\n  const response = await request.${method}(${JSON.stringify(route)}${body == null ? '' : `, { data: ${JSON.stringify(body)} }`});\n  expect(response.status()).toBeLessThan(500);\n});`);
    }
  }

  const content = `// AUTO-GENERATED FILE. DO NOT EDIT.\n// Source: ${specPath}\n// Base URL: ${baseUrl}\nconst { test, expect } = require('@playwright/test');\n\n${tests.join('\n\n')}\n`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content);
  console.log(`Generated ${tests.length} Playwright API tests from ${path.basename(specPath)}.`);
  console.log(`Output: ${outputPath}`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
