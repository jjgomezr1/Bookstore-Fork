import {
  requireBoolean,
  requireCsvList,
  requireNonNegativeInteger,
  requirePositiveInteger,
  requireString,
  requireValue,
} from "./parsers.js";

const ALLOWED_ENVIRONMENTS = new Set(["development", "test", "production"]);
const ALLOWED_SAME_SITE = new Set(["lax", "strict", "none"]);

export const loadAppSection = () => {
  const environment = requireString("NODE_ENV");

  if (!ALLOWED_ENVIRONMENTS.has(environment)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  return Object.freeze({
    environment,
    serviceName: requireString("SERVICE_NAME"),
  });
};

export const loadGrpcServerSection = () => {
  const bindAddress = requireString("GRPC_BIND_ADDRESS");

  return Object.freeze({
    bindAddress,
  });
};

export const loadGrpcClientAddress = (variableName) =>
  requireString(variableName);

export const loadDatabaseSection = () => {
  const ssl = requireBoolean("DB_SSL");

  return Object.freeze({
    host: requireString("DB_HOST"),
    port: requirePositiveInteger("DB_PORT"),
    name: requireString("DB_NAME"),
    schema: requireString("DB_SCHEMA"),
    user: requireString("DB_USER"),
    password: requireValue("DB_PASSWORD"),
    ssl,
    sslRejectUnauthorized: requireBoolean("DB_SSL_REJECT_UNAUTHORIZED"),
    poolMax: requirePositiveInteger("DB_POOL_MAX"),
    idleTimeoutMs: requirePositiveInteger("DB_IDLE_TIMEOUT_MS"),
    connectionTimeoutMs: requirePositiveInteger("DB_CONNECTION_TIMEOUT_MS"),
  });
};

export const loadJwtSection = () => {
  const secret = requireValue("AUTH_JWT_SECRET");

  if (secret.length < 32) {
    throw new Error("AUTH_JWT_SECRET must contain at least 32 characters");
  }

  const algorithm = requireString("AUTH_JWT_ALGORITHM");

  if (algorithm !== "HS256") {
    throw new Error("AUTH_JWT_ALGORITHM must be HS256");
  }

  return Object.freeze({
    secret,
    algorithm,
    issuer: requireString("AUTH_JWT_ISSUER"),
    audience: requireString("AUTH_JWT_AUDIENCE"),
    ttlSeconds: requirePositiveInteger("AUTH_TOKEN_TTL_SECONDS"),
  });
};

export const loadClickstreamSection = () => {
  const enabled = requireBoolean("CLICKSTREAM_FILE_ENABLED");
  const path = requireString("CLICKSTREAM_FILE_PATH");

  if (enabled && !path.startsWith("/")) {
    throw new Error(
      "CLICKSTREAM_FILE_PATH must be an absolute path when file logging is enabled"
    );
  }

  return Object.freeze({ enabled, path });
};

export const loadAccessLogSection = () => {
  const excludedPaths = requireCsvList("ACCESS_LOG_EXCLUDE_PATHS");

  if (excludedPaths.some((path) => !path.startsWith("/"))) {
    throw new Error("Every ACCESS_LOG_EXCLUDE_PATHS value must start with '/'");
  }

  const requestIdHeader = requireString("ACCESS_LOG_REQUEST_ID_HEADER");

  if (!/^[A-Za-z0-9-]+$/.test(requestIdHeader)) {
    throw new Error("ACCESS_LOG_REQUEST_ID_HEADER contains invalid characters");
  }

  return Object.freeze({
    enabled: requireBoolean("ACCESS_LOG_ENABLED"),
    excludedPaths: Object.freeze(excludedPaths),
    maxFieldLength: requirePositiveInteger("ACCESS_LOG_MAX_FIELD_LENGTH"),
    requestIdHeader,
  });
};

export const loadBooksSection = () => {
  const defaultLimit = requirePositiveInteger("BOOKS_DEFAULT_LIMIT");
  const maxLimit = requirePositiveInteger("BOOKS_MAX_LIMIT");

  if (defaultLimit > maxLimit) {
    throw new Error("BOOKS_DEFAULT_LIMIT cannot be greater than BOOKS_MAX_LIMIT");
  }

  return Object.freeze({ defaultLimit, maxLimit });
};

export const loadOrdersSection = () =>
  Object.freeze({
    maxDistinctItems: requirePositiveInteger("ORDERS_MAX_DISTINCT_ITEMS"),
    maxQuantityPerItem: requirePositiveInteger("ORDERS_MAX_QUANTITY_PER_ITEM"),
  });

export const loadHttpSection = () => {
  const jsonBodyLimit = requireString("HTTP_JSON_BODY_LIMIT").toLowerCase();

  if (!/^\d+(b|kb|mb)$/.test(jsonBodyLimit)) {
    throw new Error("HTTP_JSON_BODY_LIMIT must use a size such as 32768b, 32kb, or 1mb");
  }

  const basePath = requireString("API_BASE_PATH");

  if (!basePath.startsWith("/")) {
    throw new Error("API_BASE_PATH must start with '/'");
  }

  return Object.freeze({
    port: requirePositiveInteger("PORT"),
    basePath: basePath.replace(/\/$/, ""),
    trustProxyHops: requireNonNegativeInteger("HTTP_TRUST_PROXY_HOPS"),
    jsonBodyLimit,
    corsOrigins: Object.freeze(requireCsvList("CORS_ORIGINS")),
  });
};

export const loadCookieSection = () => {
  const sameSite = requireString("AUTH_COOKIE_SAME_SITE").toLowerCase();

  if (!ALLOWED_SAME_SITE.has(sameSite)) {
    throw new Error("AUTH_COOKIE_SAME_SITE must be lax, strict, or none");
  }

  const secure = requireBoolean("AUTH_COOKIE_SECURE");

  if (sameSite === "none" && !secure) {
    throw new Error("AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none");
  }

  const path = requireString("AUTH_COOKIE_PATH");

  if (!path.startsWith("/")) {
    throw new Error("AUTH_COOKIE_PATH must start with '/'");
  }

  return Object.freeze({
    name: requireString("AUTH_COOKIE_NAME"),
    httpOnly: true,
    secure,
    sameSite,
    path,
  });
};