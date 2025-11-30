import { hostname } from "node:os"
import * as Sentry from "@sentry/bun"
import packageJson from "./package.json"

if (process.env.SENTRY_DSN) {
  console.log("=> Initializing Sentry")
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    serverName: hostname(),
    environment: process.env.NODE_ENV,
    release: `${packageJson.name}@${packageJson.version}`,
    sendDefaultPii: true,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.requestDataIntegration(),
      Sentry.nodeContextIntegration(),
    ],
  })
} else {
  console.warn("=> SENTRY_DSN not set, skipping Sentry initialization")
}
