import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const env = {
  ...process.env,
  HYPERFRAMES_FFMPEG_PATH:
    process.env.HYPERFRAMES_FFMPEG_PATH || require("@ffmpeg-installer/ffmpeg").path,
  HYPERFRAMES_FFPROBE_PATH:
    process.env.HYPERFRAMES_FFPROBE_PATH || require("@ffprobe-installer/ffprobe").path,
};

// The sandbox cannot download Chrome from Google's servers. Use the npm-packed
// Chromium runtime on Linux, including the shared libraries it needs.
if (process.platform === "linux" && !env.HYPERFRAMES_BROWSER_PATH) {
  const { default: chromium, inflate, setupLambdaEnvironment } = await import(
    "@sparticuz/chromium"
  );
  const packageEntry = require.resolve("@sparticuz/chromium");
  const binDirectory = join(dirname(packageEntry), "..", "bin");

  await inflate(join(binDirectory, "al2023.tar.br"));
  setupLambdaEnvironment(join(tmpdir(), "al2023", "lib"));

  env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH;
  env.FONTCONFIG_PATH = process.env.FONTCONFIG_PATH;
  env.HYPERFRAMES_BROWSER_PATH = await chromium.executablePath();
}

const hyperframesPackage = require.resolve("hyperframes/package.json");
const hyperframesCli = join(dirname(hyperframesPackage), "bin", "hyperframes.mjs");
const child = spawn(process.execPath, [hyperframesCli, ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

process.exitCode = exitCode;
