import { app } from "./app";
import { config } from "./config";
import { prisma } from "./lib/prisma";

const server = app.listen(config.PORT, () => {
  console.log(`Focus Grid API listening on port ${config.PORT}`);
});

async function shutdown(): Promise<void> {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
