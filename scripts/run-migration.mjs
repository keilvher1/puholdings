// Runs a .sql migration file against the Neon database.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/run-migration.mjs path/to/file.sql
//
// Statements are split on semicolons using a small tokenizer that respects
// single-quoted strings (with '' escapes), dollar-quoted strings ($tag$...$tag$),
// and -- line comments, so string literals may safely contain semicolons
// (e.g. inline CSS in seeded email templates).

import { neon } from "@neondatabase/serverless"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL env var is required")
  process.exit(1)
}

const fileArg = process.argv[2]
if (!fileArg) {
  console.error("Usage: node scripts/run-migration.mjs path/to/file.sql")
  process.exit(1)
}
const filePath = resolve(fileArg)
const raw = readFileSync(filePath, "utf8")

function splitStatements(text) {
  const statements = []
  let current = ""
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    // -- line comment (outside strings)
    if (ch === "-" && text[i + 1] === "-") {
      while (i < text.length && text[i] !== "\n") i++
      continue
    }

    // single-quoted string, '' is an escaped quote
    if (ch === "'") {
      current += ch
      i++
      while (i < text.length) {
        current += text[i]
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            current += text[i + 1]
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      continue
    }

    // dollar-quoted string: $tag$ ... $tag$
    // (참고: E'...' 백슬래시 이스케이프 문자열과 큰따옴표 식별자는 다루지 않는다 —
    //  현재 마이그레이션에서는 사용하지 않음)
    if (ch === "$") {
      const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i))
      if (match) {
        const tag = match[0]
        const end = text.indexOf(tag, i + tag.length)
        if (end === -1) {
          throw new Error(`Unterminated dollar-quoted string starting at offset ${i}`)
        }
        current += text.slice(i, end + tag.length)
        i = end + tag.length
        continue
      }
    }

    if (ch === ";") {
      statements.push(current.trim())
      current = ""
      i++
      continue
    }

    current += ch
    i++
  }

  statements.push(current.trim())
  return statements.filter(Boolean)
}

const statements = splitStatements(raw)
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
