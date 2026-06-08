const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const maxBytes = 1_000_000;
const blockedNames = new Set([".env", "db.json", "tunnel-url.txt"]);
const blockedExtensions = new Set([
  ".app", ".bat", ".bin", ".cmd", ".com", ".db", ".dll", ".dmg", ".exe",
  ".jar", ".msi", ".ps1", ".scr", ".so", ".sqlite",
]);
const pinnedAction = /^[^@\s]+@[0-9a-fA-F]{40}(?:\s+#.*)?$/;

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "-s", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean).map((record) => {
    const [metadata, filename] = record.split("\t");
    return { mode: metadata.split(" ")[0], filename };
  });
}

function main() {
  const errors = [];
  for (const { mode, filename } of trackedFiles()) {
    const file = path.join(root, filename);
    const extension = path.extname(filename).toLowerCase();
    if (mode === "120000") errors.push(`${filename}: symlinks are not allowed`);
    if (mode.endsWith("755")) errors.push(`${filename}: executable mode is not allowed`);
    if (blockedNames.has(path.basename(filename)) || blockedExtensions.has(extension)) {
      errors.push(`${filename}: blocked private, database, or executable file`);
    }
    const data = fs.readFileSync(file);
    if (data.length > maxBytes) errors.push(`${filename}: exceeds ${maxBytes} bytes`);
    if (data.includes(0)) errors.push(`${filename}: binary content is not allowed`);

    if (/^\.github\/workflows\/.*\.ya?ml$/.test(filename)) {
      const text = data.toString("utf8");
      if (/^\s*pull_request_target\s*:/m.test(text)) {
        errors.push(`${filename}: pull_request_target is not allowed`);
      }
      text.split(/\r?\n/).forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("uses:")) return;
        const action = trimmed.slice(5).trim();
        if (!action.startsWith("./") && !pinnedAction.test(action)) {
          errors.push(`${filename}:${index + 1}: action must use a full commit SHA`);
        }
      });
    }
  }

  if (errors.length) {
    console.error("Repository policy failed:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log("Repository policy passed.");
}

main();
