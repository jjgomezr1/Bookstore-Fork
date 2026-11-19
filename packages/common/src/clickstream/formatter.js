import { randomUUID } from "node:crypto";

import { EVENT_SCHEMA_VERSION } from "../config/events.js";

const MONTH_NAMES = Object.freeze([
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]);

const EMPTY_VALUE = "-";

export const createClickstreamFormatter = ({ maxFieldLength }) => {
  const trimToMaxLength = (value) =>
    value.length <= maxFieldLength ? value : value.slice(0, maxFieldLength);

  const normalizeLogValue = (value) => {
    if (value === undefined || value === null || value === "") {
      return EMPTY_VALUE;
    }

    return trimToMaxLength(String(value).replace(/[\r\n\t]/g, " "));
  };

  const escapeQuotedValue = (value) =>
    normalizeLogValue(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const encodeContextValue = (value) => {
    const normalizedValue = normalizeLogValue(value);

    if (normalizedValue === EMPTY_VALUE) {
      return EMPTY_VALUE;
    }

    const encodedValue = encodeURIComponent(normalizedValue);

    if (encodedValue.length <= maxFieldLength) {
      return encodedValue;
    }

    let truncatedValue = encodedValue.slice(0, maxFieldLength);
    const lastPercentIndex = truncatedValue.lastIndexOf("%");

    if (lastPercentIndex >= truncatedValue.length - 2) {
      truncatedValue = truncatedValue.slice(0, lastPercentIndex);
    }

    return truncatedValue || EMPTY_VALUE;
  };

  const formatTimestamp = (date) => {
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = MONTH_NAMES[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");

    return `${day}/${month}/${year}:${hours}:${minutes}:${seconds} +0000`;
  };

  const normalizeClientIp = (ip) => {
    const normalizedIp = normalizeLogValue(ip);

    if (normalizedIp.startsWith("::ffff:")) {
      return normalizedIp.slice(7);
    }

    return normalizedIp;
  };

  const buildContextSection = ({ requestId, sessionId, event, latencyMs }) =>
    [
      `schema_version=${EVENT_SCHEMA_VERSION}`,
      `request_id=${encodeContextValue(requestId)}`,
      `session_id=${encodeContextValue(sessionId)}`,
      `event_id=${encodeContextValue(event?.eventId)}`,
      `event_type=${encodeContextValue(event?.eventType)}`,
      `event_source=${encodeContextValue(event?.eventSource)}`,
      `resource_type=${encodeContextValue(event?.resourceType)}`,
      `resource_id=${encodeContextValue(event?.resourceId)}`,
      `isbn=${encodeContextValue(event?.isbn)}`,
      `recommendation_id=${encodeContextValue(event?.recommendationId)}`,
      `model_version=${encodeContextValue(event?.modelVersion)}`,
      `experiment_id=${encodeContextValue(event?.experimentId)}`,
      `position=${encodeContextValue(event?.position)}`,
      `quantity=${encodeContextValue(event?.quantity)}`,
      `search_query=${encodeContextValue(event?.searchQuery)}`,
      `order_id=${encodeContextValue(event?.orderId)}`,
      `latency_ms=${encodeContextValue(latencyMs)}`,
    ].join(" ");

  const formatLine = ({
    clientIp,
    remoteUser,
    startedAt,
    method,
    url,
    httpVersion,
    statusCode,
    responseSize,
    referrer,
    userAgent,
    requestId,
    sessionId,
    event,
    latencyMs,
  }) => {
    const requestLine = `${method} ${url} HTTP/${httpVersion}`;
    const context = buildContextSection({ requestId, sessionId, event, latencyMs });

    return [
      normalizeClientIp(clientIp),
      EMPTY_VALUE,
      normalizeLogValue(remoteUser),
      `[${formatTimestamp(startedAt)}]`,
      `"${escapeQuotedValue(requestLine)}"`,
      normalizeLogValue(statusCode),
      normalizeLogValue(responseSize),
      `"${escapeQuotedValue(referrer)}"`,
      `"${escapeQuotedValue(userAgent)}"`,
      `"${context}"`,
    ].join(" ");
  };

  return Object.freeze({ formatLine, newEventId: () => randomUUID() });
};