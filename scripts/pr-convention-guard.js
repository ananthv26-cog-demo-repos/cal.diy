const fs = require("fs");

const files = process.argv.slice(2);
const violations = [];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  const content = fs.readFileSync(file, "utf8");

  if (content.includes("prisma.") && content.includes("include:")) {
    violations.push(`${file}: Use 'select' instead of 'include' in Prisma queries (AGENTS.md)`);
  }

  if (content.includes("as any")) {
    violations.push(`${file}: Avoid 'as any' type casts (AGENTS.md)`);
  }

  if (content.includes("credential") && content.includes("key: true")) {
    violations.push(`${file}: Do not expose credential.key; use safeCredentialSelect (AGENTS.md)`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("No AGENTS.md convention violations found.");
