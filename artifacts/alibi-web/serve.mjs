import express from "express";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT must be a valid port number.");
}

const app = express();
const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
app.use(process.env.BASE_PATH || "/", express.static(publicDirectory));

app.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Alibi static frontend listening on port ${port}\n`);
}).on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});