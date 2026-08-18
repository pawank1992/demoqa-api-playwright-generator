const fs = require('fs');
const path = require('path');
const SwaggerParser = require('@apidevtools/swagger-parser');

const specPath = process.env.OPENAPI_SPEC || path.resolve('specs/demoqa.yaml');
const outputPath = path.resolve('generated/api.generated.spec.js');
const manifestPath = path.resolve('generated/test-manifest.json');

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

function literal(value) {
  return JSON.stringify(value, null, 2);
}

function exampleFromSchema(schema = {}) {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
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
  if (schema.type === 'string') {
    if (schema.format === 'email') return 'generated@example.com';
    if (schema.format === 'date') return '2026-01-01';
    return 'generated-value';
  }
  return null;
}

function invalidValue(schema = {}, valid) {
  if (schema.type === 'string') {
    if (schema.enum) return '__invalid_enum_value__';
    if (schema.format === 'email') return 'not-an-email';
    if (schema.minLength > 0) return '';
    return 12345;
  }
  if (schema.type === 'integer' || schema.type === 'number') return 'not-a-number';
  if (schema.type === 'boolean') return 'not-a-boolean';
  if (schema.type === 'array') return {};
  if (schema.type === 'object') return 'not-an-object';
  return valid === undefined ? '__invalid__' : null;
}

function boundaryValue(schema = {}) {
  if (schema.type === 'string') {
    if (schema.minLength !== undefined) return 'x'.repeat(schema.minLength);
    if (schema.maxLength !== undefined) return 'x'.repeat(schema.maxLength);
  }
  if (schema.type === 'integer' || schema.type === 'number') {
    if (schema.minimum !== undefined) return schema.minimum;
    if (schema.maximum !== undefined) return schema.maximum;
  }
  if (schema.type === 'array') {
    if (schema.minItems !== undefined) return Array.from({ length: schema.minItems }, () => exampleFromSchema(schema.items));
    if (schema.maxItems !== undefined) return Array.from({ length: schema.maxItems }, () => exampleFromSchema(schema.items));
  }
  return undefined;
}

function mutateRequiredBody(schema, mode) {
  const body = exampleFromSchema(schema);
  if (!schema || schema.type !== 'object') return mode === 'invalid-type' ? invalidValue(schema, body) : body;
  const required = schema.required || [];
  if (mode === 'missing-required' && required.length) {
    delete body[required[0]];
    return body;
  }
  if (mode === 'invalid-type') {
    const key = required[0] || Object.keys(schema.properties || {})[0];
    if (key) body[key] = invalidValue(schema.properties?.[key], body[key]);
  }
  if (mode === 'boundary') {
    for (const key of Object.keys(schema.properties || {})) {
      const value = boundaryValue(schema.properties[key]);
      if (value !== undefined) body[key] = value;
    }
  }
  return body;
}

function requestBody(operation) {
  const content = operation.requestBody?.content;
  if (!content) return null;
  const media = content['application/json'] || Object.values(content)[0];
  if (!media) return null;
  return { schema: media.schema || {}, value: media.example ?? exampleFromSchema(media.schema || {}) };
}

function successStatus(responses = {}) {
  const codes = Object.keys(responses).filter(code => /^2\d\d$/.test(code));
  return Number(codes[0] || 200);
}

function responseSchema(responses = {}) {
  const status = successStatus(responses);
  const response = responses[String(status)] || {};
  const content = response.content || {};
  const media = content['application/json'] || Object.values(content)[0];
  return media?.schema || null;
}

function pathParameterExample(parameter) {
  return parameter.example ?? parameter.schema?.example ?? parameter.schema?.default ?? exampleFromSchema(parameter.schema || {});
}

function buildRequest(route, method, operation, bodyValue) {
  const parameters = [...(operation.parameters || [])];
  const pathParams = parameters.filter(p => p.in === 'path');
  const queryParams = parameters.filter(p => p.in === 'query');
  let finalRoute = route;
  for (const p of pathParams) finalRoute = finalRoute.replace(`{${p.name}}`, encodeURIComponent(pathParameterExample(p)));
  const query = {};
  for (const p of queryParams) {
    if (!p.required) continue;
    query[p.name] = pathParameterExample(p);
  }
  const options = [];
  if (Object.keys(query).length) options.push(`params: ${literal(query)}`);
  if (bodyValue !== undefined && bodyValue !== null) options.push(`data: ${literal(bodyValue)}`);
  return `{${options.length ? `\n    ${options.join(',\n    ')}\n  ` : ''}}`;
}

function testBlock(name, route, method, operation, bodyValue, assertion) {
  const request = buildRequest(route, method, operation, bodyValue);
  return `test(${literal(name)}, async ({ request }) => {\n  const response = await request.${method}(${literal(route.replace(/\{[^}]+\}/g, m => m))}, ${request});\n  ${assertion}\n});`;
}

function pathForRuntime(route, operation) {
  let result = route;
  for (const p of operation.parameters || []) {
    if (p.in === 'path') result = result.replace(`{${p.name}}`, '${PATH_PARAM_' + p.name.toUpperCase() + '}');
  }
  return result;
}

function generatedRequest(route, method, operation, bodyValue) {
  const parameters = operation.parameters || [];
  let runtimeRoute = route;
  const pathValues = {};
  for (const p of parameters.filter(p => p.in === 'path')) {
    pathValues[p.name] = pathParameterExample(p);
    runtimeRoute = runtimeRoute.replace(`{${p.name}}`, encodeURIComponent(pathValues[p.name]));
  }
  const query = {};
  for (const p of parameters.filter(p => p.in === 'query')) {
    if (p.required) query[p.name] = pathParameterExample(p);
  }
  const opts = [];
  if (Object.keys(query).length) opts.push(`params: ${literal(query)}`);
  if (bodyValue !== undefined && bodyValue !== null) opts.push(`data: ${literal(bodyValue)}`);
  return `request.${method}(${literal(runtimeRoute)}${opts.length ? `, { ${opts.join(', ')} }` : ''})`;
}

async function main() {
  const api = await SwaggerParser.dereference(specPath);
  const tests = [];
  const manifest = [];

  for (const [route, pathItem] of Object.entries(api.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!METHODS.has(method)) continue;
      const body = requestBody(operation);
      const validBody = body?.value;
      const status = successStatus(operation.responses);
      const opName = operation.operationId || `${method.toUpperCase()} ${route}`;
      const add = (category, title, code) => {
        tests.push(code);
        manifest.push({ operationId: opName, method: method.toUpperCase(), path: route, category, title });
      };

      add('positive', 'valid request / expected status', `test(${literal(`${opName} - positive - expected ${status}`)}, async ({ request }) => {\n  const response = await ${generatedRequest(route, method, operation, validBody)};\n  expect(response.status()).toBe(${status});\n});`);

      add('contract', 'response content type', `test(${literal(`${opName} - contract - content type`)} , async ({ request }) => {\n  const response = await ${generatedRequest(route, method, operation, validBody)};\n  expect(response.status()).toBe(${status});\n  const contentType = response.headers()['content-type'] || '';\n  expect(contentType).toContain('application/json');\n});`);

      add('negative', 'server error protection', `test(${literal(`${opName} - negative - no 5xx`)} , async ({ request }) => {\n  const response = await ${generatedRequest(route, method, operation, validBody)};\n  expect(response.status()).toBeLessThan(500);\n});`);

      if (body?.schema && body.schema.type === 'object' && (body.schema.required || []).length) {
        const missing = mutateRequiredBody(body.schema, 'missing-required');
        add('negative', 'missing required request field', `test(${literal(`${opName} - negative - missing required field`)} , async ({ request }) => {\n  const response = await ${generatedRequest(route, method, operation, missing)};\n  expect(response.status()).toBeGreaterThanOrEqual(400);\n  expect(response.status()).toBeLessThan(500);\n});`);
      }

      if (body?.schema) {
        const invalid = mutateRequiredBody(body.schema, 'invalid-type');
        add('negative', 'invalid request data type', `test(${literal(`${opName} - negative - invalid data type`)} , async ({ request }) => {\n  const response = await ${generatedRequest(route, method, operation, invalid)};\n  expect(response.status()).toBeGreaterThanOrEqual(400);\n  expect(response.status()).toBeLessThan(500);\n});`);
        const boundary = mutateRequiredBody(body.schema, 'boundary');
        if (JSON.stringify(boundary) !== JSON.stringify(validBody)) {
          add('boundary', 'schema boundary values', `test(${literal(`${opName} - boundary - schema limits`)} , async ({ request }) => {\n  const response = await ${generatedRequest(route, method, operation, boundary)};\n  expect(response.status()).toBeLessThan(500);\n});`);
        }
      }

      for (const p of operation.parameters || []) {
        if (!p.required) continue;
        if (p.in === 'query') {
          add('negative', `missing required query parameter ${p.name}`, `test(${literal(`${opName} - negative - missing query ${p.name}`)}, async ({ request }) => {\n  const response = await request.${method}(${literal(route)});\n  expect(response.status()).toBeGreaterThanOrEqual(400);\n  expect(response.status()).toBeLessThan(500);\n});`);
        }
        if (p.in === 'path') {
          add('negative', `invalid path parameter ${p.name}`, `test(${literal(`${opName} - negative - invalid path ${p.name}`)}, async ({ request }) => {\n  const invalidPath = ${literal(route)}.replace(${literal(`{${p.name}}`)}, 'invalid-generated-id');\n  const response = await request.${method}(invalidPath);\n  expect(response.status()).toBeGreaterThanOrEqual(400);\n  expect(response.status()).toBeLessThan(500);\n});`);
        }
      }

      const schema = responseSchema(operation.responses);
      if (schema) {
        add('contract', 'response schema shape', `test(${literal(`${opName} - contract - response schema shape`)} , async ({ request }) => {\n  const response = await ${generatedRequest(route, method, operation, validBody)};\n  expect(response.status()).toBe(${status});\n  const body = await response.json();\n  ${schema.type === 'object' && schema.required?.length ? schema.required.map(k => `expect(body).toHaveProperty(${literal(k)});`).join('\n  ') : 'expect(body).toBeDefined();'}\n});`);
      }
    }
  }

  const header = `// AUTO-GENERATED FILE. DO NOT EDIT.\n// Generated from: ${specPath}\nconst { test, expect } = require('@playwright/test');\n\n`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, header + tests.join('\n\n') + '\n');
  fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), source: specPath, total: manifest.length, byCategory: manifest.reduce((a, x) => { a[x.category] = (a[x.category] || 0) + 1; return a; }, {}), tests: manifest }, null, 2));
  console.log(`Generated ${manifest.length} tests.`);
  console.log(JSON.stringify(manifest.reduce((a, x) => { a[x.category] = (a[x.category] || 0) + 1; return a; }, {}), null, 2));
}

main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
