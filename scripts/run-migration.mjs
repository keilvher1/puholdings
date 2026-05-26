// Runs a .sql migration file against the Neon database.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/run-migration.mjs [path/to/file.sql]
//
// Defaults to scripts/migrations/2026-add-popups.sql when no path is given.
// Statements are split on semicolons (no semicolons appear inside statements
// in our migrations) and executed sequentially over the Neon HTTP driver.

import { neon } from "@neondatabase/serverless"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL env var is required")
  process.exit(1)
}

const fileArg = process.argv[2] || join(__dirname, "migrations", "2026-add-popups.sql")
const filePath = resolve(fileArg)
const raw = readFileSync(filePath, "utf8")

// Drop full-line SQL comments, then split into individual statements.
const statements = raw
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean)

const sql = neon(DATABASE_URL)

async function run() {
  console.log(`Applying migration: ${filePath}`)
  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/g, " ").slice(0, 70)
    console.log(`  > ${preview}${stmt.length > 70 ? "..." : ""}`)
    await sql.query(stmt)
  }
  console.log(`Done. ${statements.length} statement(s) applied.`)
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
