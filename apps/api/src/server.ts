import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { SampleLookup } from "./lookup/sample.js";
import { MemoryStore } from "./store/memory.js";
import { loadSample } from "./store/sample.js";

const config = readConfig();
const store = new MemoryStore();

if (!config.sample) {
  console.warn("alibi-api: a provider key is configured but the live provider not implemented yet; answering from the sample register.");
}
const lookup = new SampleLookup();

if (config.sample) {
  const loaded = await loadSample(store);
  console.log(
    `alibi-api: sample register loaded (${loaded.vendors} vendors, ${loaded.captures} captures, ${loaded.transactions} transactions)`,
  );
}

createApp({ store, lookup, sample: config.sample, webDist: config.webDist }).listen(config.port, () => {
  console.log(`alibi-api listening on ${config.port}${config.webDist ? ` and serving ${config.webDist}` : ""}`);
});
