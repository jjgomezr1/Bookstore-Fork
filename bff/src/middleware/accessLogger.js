import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export const setBehaviorEvent = (req, event) => {
  req.behaviorEvent = Object.freeze({
    eventId: randomUUID(),
    eventType: event.eventType,
    eventSource: event.eventSource,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    isbn: event.isbn,
    recommendationId: event.recommendationId,
    modelVersion: event.modelVersion,
    experimentId: event.experimentId,
    position: event.position,
    quantity: event.quantity,
    searchQuery: event.searchQuery,
    orderId: event.orderId,
  });
};

export const createAccessLogger = ({ accessLog, formatter, clickstreamWriter }) =>
  (req, res, next) => {
    if (!accessLog.enabled || accessLog.excludedPaths.includes(req.path)) {
      next();
      return;
    }

    const startedAt = new Date();
    const startedPerformance = performance.now();

    req.requestId = randomUUID();
    res.set(accessLog.requestIdHeader, req.requestId);

    res.once("finish", () => {
      const latencyMs = Math.max(0, Math.round(performance.now() - startedPerformance));

      const line = formatter.formatLine({
        clientIp: req.ip,
        remoteUser: req.auth?.customerId,
        startedAt,
        method: req.method,
        url: req.originalUrl,
        httpVersion: req.httpVersion,
        statusCode: res.statusCode,
        responseSize: res.getHeader("content-length"),
        referrer: req.get("referer"),
        userAgent: req.get("user-agent"),
        requestId: req.requestId,
        sessionId: req.auth?.sessionId,
        event: req.behaviorEvent,
        latencyMs,
      });

      process.stdout.write(`${line}\n`);
      clickstreamWriter.writeLine(line);
    });

    next();
  };