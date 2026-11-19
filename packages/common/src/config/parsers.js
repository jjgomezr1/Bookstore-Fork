export const requireValue = (name) => {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue.trim() === "") {
    throw new Error(`${name} is required`);
  }

  return rawValue;
};

export const requireString = (name) => requireValue(name).trim();

export const requirePositiveInteger = (name) => {
  requireValue(name);
  const value = Number.parseInt(process.env[name], 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
};

export const requireNonNegativeInteger = (name) => {
  requireValue(name);
  const value = Number.parseInt(process.env[name], 10);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
};

export const requireBoolean = (name) => {
  const normalizedValue = requireValue(name).trim().toLowerCase();

  if (normalizedValue === "true") return true;
  if (normalizedValue === "false") return false;

  throw new Error(`${name} must be either true or false`);
};

export const requireCsvList = (name) => {
  const values = requireValue(name)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error(`${name} must contain at least one value`);
  }

  return values;
};