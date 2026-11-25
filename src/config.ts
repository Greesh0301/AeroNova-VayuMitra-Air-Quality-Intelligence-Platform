import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BASE_DIR = path.resolve(__dirname, "..");
export const FRONTEND_DIR = path.join(BASE_DIR, "frontend");

export const Config = {
  PORT: Number(process.env.PORT || 3000),
  HOST: "0.0.0.0",
  DEFAULT_CITY: (process.env.VAYUMITRA_DEFAULT_CITY || "Mumbai").trim() || "Mumbai",
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
  HTTP_TIMEOUT_MS: 10_000,
};
