// A small JSON Schema checker for guides/schema/guide.schema.json: type, required, properties, additionalProperties,
// items, enum, minItems, minLength, pattern and local $ref. No dependencies. It returns a list of plain messages.

function resolve(root, ref) {
  return ref
    .replace(/^#\//, "")
    .split("/")
    .reduce((node, key) => node && node[key], root);
}

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function validate(schema, data, where = "guide.json", root = schema) {
  if (schema.$ref) return validate(resolve(root, schema.$ref), data, where, root);
  const errors = [];
  const actual = typeOf(data);
  if (schema.type) {
    const ok = schema.type === "integer" ? Number.isInteger(data) : schema.type === actual;
    if (!ok) return [`${where} must be ${schema.type}, not ${actual}`];
  }
  if (schema.enum && !schema.enum.includes(data)) errors.push(`${where} must be one of: ${schema.enum.join(", ")}`);
  if (actual === "string") {
    if (schema.minLength != null && data.length < schema.minLength) errors.push(`${where} must not be empty`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) errors.push(`${where} must match ${schema.pattern}: ${data}`);
  }
  if (actual === "array") {
    if (schema.minItems != null && data.length < schema.minItems) errors.push(`${where} needs at least ${schema.minItems} item(s)`);
    if (schema.items) data.forEach((item, i) => errors.push(...validate(schema.items, item, `${where}[${i}]`, root)));
  }
  if (actual === "object") {
    for (const key of schema.required || []) if (!(key in data)) errors.push(`${where} is missing "${key}"`);
    const props = schema.properties || {};
    for (const [key, value] of Object.entries(data)) {
      if (props[key]) errors.push(...validate(props[key], value, `${where}.${key}`, root));
      else if (schema.additionalProperties === false) errors.push(`${where} has an unknown setting "${key}"`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") errors.push(...validate(schema.additionalProperties, value, `${where}.${key}`, root));
    }
  }
  return errors;
}

module.exports = { validate };
