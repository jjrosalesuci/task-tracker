import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { config } from "./config";
import { errorHandler, notFound } from "./middleware/errors";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { tasksRouter } from "./routes/tasks";
import { usersRouter } from "./routes/users";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use((req, res, next) => {
  const origin = req.get("origin");
  const referer = req.get("referer");
  const refererOrigin = referer ? (() => {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  })() : null;
  const isApi = req.path.startsWith("/api/");
  if ((origin && origin !== config.APP_ORIGIN) ||
      (refererOrigin && refererOrigin !== config.APP_ORIGIN)) {
    if (req.method === "OPTIONS" || (isApi && !["GET", "HEAD"].includes(req.method))) {
      res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed" } });
      return;
    }
  }
  if (origin === config.APP_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    if (origin !== config.APP_ORIGIN) {
      res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin not allowed" } });
      return;
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send();
    return;
  }
  next();
});
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use("/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/users", usersRouter);

const clientDist = path.resolve(__dirname, "../../client/dist");
if (config.NODE_ENV === "production" && existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false }));
  app.get("*splat", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"), (error) => error && next(error));
  });
}

app.use(notFound);
app.use(errorHandler);
