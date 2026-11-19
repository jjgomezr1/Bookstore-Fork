export const createLogger = ({ serviceName, environment }) => {
  const writeLog = (level, message, metadata = {}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: serviceName,
      environment,
      message,
      ...metadata,
    };

    const serializedEntry = JSON.stringify(entry);

    if (level === "error") {
      console.error(serializedEntry);
      return;
    }

    console.log(serializedEntry);
  };

  return Object.freeze({
    info: (message, metadata) => writeLog("info", message, metadata),
    error: (message, metadata) => writeLog("error", message, metadata),
  });
};