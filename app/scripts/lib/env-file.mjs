import { readFileSync } from "node:fs";

export function loadEnvFileFromArgs(argv = process.argv, env = process.env) {
  const envFileIndex = argv.indexOf("--env-file");
  if (envFileIndex === -1) {
    return null;
  }

  const envFile = argv[envFileIndex + 1];
  if (!envFile) {
    throw new Error("--env-file requires a path.");
  }

  loadEnvFile(envFile, env);
  return envFile;
}

export function loadEnvFile(path, env = process.env) {
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const name = line.slice(0, separator).trim();
    const value = unquote(line.slice(separator + 1).trim());
    if (!env[name]) {
      env[name] = value;
    }
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
