import { fileURLToPath } from "node:url";

// Source modules in src/ and the production bundle in dist/ both sit one
// directory below the app's resources. Do not depend on the launch directory.
export const dataDirectory = fileURLToPath(new URL("../data/", import.meta.url));