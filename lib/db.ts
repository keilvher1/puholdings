import { neon } from "@neondatabase/serverless"

export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Please add the Neon integration or set the environment variable."
    )
  }
  return neon(url)
}
