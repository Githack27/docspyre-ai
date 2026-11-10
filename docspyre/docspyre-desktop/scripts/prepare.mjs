import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile, rm, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dev = process.argv.includes("--dev");
const npmCli = process.env.npm_execpath;

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with ${result.status}`);
}

function npm(args, cwd) {
  if (!npmCli) throw new Error("Run this script using npm run build:app or npm run prepare:dev");
  run(process.execPath, [npmCli, ...args], cwd);
}

function safeGenerated(relative) {
  const resolved = path.resolve(root, relative);
  const inside = path.relative(root, resolved);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) throw new Error("Invalid generated path");
  return resolved;
}

if (Number(process.versions.node.split(".")[0]) < 20) {
  throw new Error("Use Node.js 20+ LTS to build the desktop runtime");
}

const rust = spawnSync("rustc", ["-vV"], { encoding: "utf8" });
if (rust.status !== 0) throw new Error(`Cannot run the Rust toolchain: ${rust.error?.message ?? rust.stderr}`);
const host = /^host: (.+)$/m.exec(rust.stdout)?.[1];
if (!host) throw new Error("Cannot determine Rust host target");
if (process.env.TAURI_ENV_TARGET_TRIPLE && process.env.TAURI_ENV_TARGET_TRIPLE !== host) {
  throw new Error("Cross-compilation requires a matching target Node runtime. Build on the target OS/architecture.");
}

const binaries = safeGenerated("src-tauri/binaries");
await mkdir(binaries, { recursive: true });
const runtimeName = `docspyre-node-${host}${process.platform === "win32" ? ".exe" : ""}`;
const runtimeTarget = path.join(binaries, runtimeName);

try {
  const [targetStat, srcStat] = await Promise.all([stat(runtimeTarget), stat(process.execPath)]);
  if (targetStat.size !== srcStat.size) {
    await cp(process.execPath, runtimeTarget, { force: true });
  }
} catch {
  try {
    await cp(process.execPath, runtimeTarget);
  } catch (err) {
    if (err.code !== "EPERM") throw err;
    console.warn(`Note: Using existing runtime binary ${runtimeName}`);
  }
}

if (dev) {
  await mkdir(path.join(root, "src-tauri/resources/backend"), { recursive: true });
  try {
    await cp(path.join(root, "backend/.env.example"), path.join(root, "src-tauri/resources/backend/.env.example"));
  } catch {}
  process.exit(0);
}

npm(["run", "build:backend"]);
npm(["run", "build:frontend"]);

// Build an isolated production dependency tree from the committed workspace lockfile.
const staging = safeGenerated(".local/production");
await rm(staging, { force: true, recursive: true });
await mkdir(staging, { recursive: true });
for (const relative of ["package.json", "package-lock.json", "frontend/package.json", "backend/package.json"]) {
  await mkdir(path.dirname(path.join(staging, relative)), { recursive: true });
  await cp(path.join(root, relative), path.join(staging, relative));
}
npm(["ci", "--omit=dev", "--ignore-scripts", "--workspace", "backend", "--no-audit", "--no-fund"], staging);

const resources = safeGenerated("src-tauri/resources/backend");
await rm(resources, { force: true, recursive: true });
await mkdir(resources, { recursive: true });
for (const relative of ["dist", "migrations", "infrastructure", "package.json", ".env.example"]) {
  await cp(path.join(root, "backend", relative), path.join(resources, relative), { recursive: true });
}
await cp(path.join(staging, "node_modules"), path.join(resources, "node_modules"), {
  recursive: true,
  filter: source => !source.includes(`${path.sep}@docspyre`),
});
try {
  await cp(path.join(staging, "backend/node_modules"), path.join(resources, "node_modules"), { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const licensePath = process.env.NODE_LICENSE_PATH ?? path.join(path.dirname(process.execPath), "LICENSE");
try {
  await cp(licensePath, path.join(resources, "NODE-LICENSE.txt"));
} catch {}

await writeFile(
  path.join(resources, "runtime-manifest.json"),
  JSON.stringify(
    {
      node: process.version,
      target: host,
      sha256: createHash("sha256").update(await readFile(process.execPath)).digest("hex"),
    },
    null,
    2,
  ) + "\n",
);

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".env" || (entry.name.startsWith(".env.") && entry.name !== ".env.example")) {
      throw new Error(`Secret configuration file found in package: ${entry.name}`);
    }
    if (entry.isDirectory()) await inspect(path.join(directory, entry.name));
  }
}
await inspect(resources);
console.log(`Prepared frontend, backend, migrations, production dependencies, and Node ${process.version} (${host}).`);

