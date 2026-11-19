import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export const createClickstreamWriter = ({ clickstreamConfig, logger }) => {
  let stream = null;
  let fileAvailable = false;

  const initialize = async () => {
    if (!clickstreamConfig.enabled) {
      return;
    }

    const directory = dirname(clickstreamConfig.path);
    await mkdir(directory, { recursive: true });

    stream = createWriteStream(clickstreamConfig.path, {
      flags: "a",
      encoding: "utf8",
    });

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        stream.off("open", handleOpen);
        stream.off("error", handleError);
      };

      const handleOpen = () => {
        cleanup();
        fileAvailable = true;
        resolve();
      };

      const handleError = (error) => {
        cleanup();
        reject(error);
      };

      stream.once("open", handleOpen);
      stream.once("error", handleError);
    });

    stream.on("error", (error) => {
      fileAvailable = false;
      logger?.error("Clickstream file writer failed", {
        path: clickstreamConfig.path,
        error: error.message,
      });
    });

    logger?.info("Clickstream file writer initialized", {
      path: clickstreamConfig.path,
    });
  };

  const writeLine = (line) => {
    if (!clickstreamConfig.enabled || !stream || !fileAvailable) {
      return;
    }

    stream.write(`${line}\n`);
  };

  const close = async () => {
    if (!stream) {
      return;
    }

    const streamToClose = stream;
    stream = null;
    fileAvailable = false;

    await new Promise((resolve) => {
      streamToClose.end(resolve);
    });
  };

  return Object.freeze({ initialize, writeLine, close });
};