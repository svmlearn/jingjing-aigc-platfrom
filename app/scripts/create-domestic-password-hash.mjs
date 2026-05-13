#!/usr/bin/env node
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const passwordHashAlgorithm = "pbkdf2_sha256";
const passwordHashIterations = 210_000;
const passwordHashKeyLength = 32;

function readPassword() {
  const argPassword = process.argv[2];
  if (argPassword) {
    return argPassword;
  }

  const stdin = readFileSync(0, "utf8").trim();
  if (!stdin) {
    throw new Error("Usage: node scripts/create-domestic-password-hash.mjs <password>");
  }

  return stdin;
}

const password = readPassword();
const salt = randomBytes(16).toString("base64url");
const derived = pbkdf2Sync(
  password,
  salt,
  passwordHashIterations,
  passwordHashKeyLength,
  "sha256",
).toString("base64url");

process.stdout.write(`${passwordHashAlgorithm}$${passwordHashIterations}$${salt}$${derived}\n`);
