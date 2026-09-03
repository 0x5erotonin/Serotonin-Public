/**
 * A subset JSON Schema validator, shared by the two specs that check the
 * integration export.
 *
 * Test-only, and deliberately small: it supports exactly the constructs
 * docs/serotonin.api.v1.schema.json uses — $ref, type unions, const, enum,
 * pattern, minimum/maximum, format: date-time, required, properties,
 * additionalProperties: false and items. It is not a general-purpose validator
 * and should not be used as one. Its own behaviour is verified against
 * deliberately broken input in tests/apiexport.spec.mjs, because a checker
 * nobody has tested is worse than no checker at all.
 */

import { readFileSync } from 'node:fs';

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function resolveRef(ref, root) {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref: ${ref}`);
  return ref.slice(2).split('/').reduce((node, key) => {
    if (!node || !(key in node)) throw new Error(`$ref not found: ${ref}`);
    return node[key];
  }, root);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  if (typeof value === 'number') return 'number';
  return typeof value; // string | boolean | object
}

function typeMatches(actual, allowed) {
  if (actual === allowed) return true;
  // An integer satisfies "number"; nothing else is widened.
  return allowed === 'number' && actual === 'integer';
}

function validate(value, node, root, path = '$', errors = []) {
  if (node.$ref) return validate(value, resolveRef(node.$ref, root), root, path, errors);

  if ('const' in node && value !== node.const) {
    errors.push(`${path}: expected const ${JSON.stringify(node.const)}, got ${JSON.stringify(value)}`);
    return errors;
  }
  if (node.enum && !node.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(node.enum)}`);
    return errors;
  }

  if (node.type) {
    const allowed = Array.isArray(node.type) ? node.type : [node.type];
    const actual = typeOf(value);
    if (!allowed.some((candidate) => typeMatches(actual, candidate))) {
      errors.push(`${path}: expected type ${allowed.join('|')}, got ${actual}`);
      return errors;
    }
  }

  if (typeof value === 'string') {
    if (node.pattern && !new RegExp(node.pattern).test(value)) {
      errors.push(`${path}: ${JSON.stringify(value)} does not match ${node.pattern}`);
    }
    if (node.format === 'date-time' && !ISO_DATE_TIME.test(value)) {
      errors.push(`${path}: ${JSON.stringify(value)} is not an ISO 8601 date-time`);
    }
  }

  if (typeof value === 'number') {
    if (node.minimum !== undefined && value < node.minimum) {
      errors.push(`${path}: ${value} is below the minimum ${node.minimum}`);
    }
    if (node.maximum !== undefined && value > node.maximum) {
      errors.push(`${path}: ${value} is above the maximum ${node.maximum}`);
    }
  }

  if (Array.isArray(value) && node.items) {
    value.forEach((item, index) => validate(item, node.items, root, `${path}[${index}]`, errors));
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of node.required || []) {
      if (!(key in value)) errors.push(`${path}: missing required property "${key}"`);
    }
    const properties = node.properties || {};
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value) validate(value[key], childSchema, root, `${path}.${key}`, errors);
    }
  }

  return errors;
}

export { validate };

const schema = JSON.parse(
  readFileSync(new URL('../docs/serotonin.api.v1.schema.json', import.meta.url), 'utf8'),
);

/** Validate a bundle against the published schema. Returns an array of errors. */
export function validateApiExport(bundle) {
  return validate(bundle, schema, schema);
}
