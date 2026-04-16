const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { version } = require("./package.json");

const exePath = path.join(__dirname, "dist", "win-unpacked", "Camera PiP.exe");
const icoPath = path.join(__dirname, "icon.ico");
const oldZip = path.join(__dirname, "dist", `Camera-PiP-v${version}.zip`);

async function main() {
  if (fs.existsSync(oldZip)) {
    fs.unlinkSync(oldZip);
    console.log(`Removed old build: ${oldZip}`);
  }

  // electron-builder packages the app (signAndEditExecutable: false skips winCodeSign)
  console.log("Running electron-builder...");
  execSync("npx electron-builder", { stdio: "inherit" });

  // Embed icon and metadata directly into the exe
  console.log("Embedding icon and metadata via rcedit...");
  const { rcedit } = await import("rcedit");
  await rcedit(exePath, {
    icon: icoPath,
    "version-string": {
      ProductName: "Camera PiP",
      FileDescription: "Camera PiP",
    },
    "file-version": version,
    "product-version": version,
  });

  // Re-zip with the updated exe
  console.log("Re-creating zip...");
  execSync("npx electron-builder --prepackaged dist/win-unpacked", {
    stdio: "inherit",
  });
  console.log(`Build complete: Camera-PiP-v${version}.zip`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
