// 메신저 통합 테스트용 로컬 Postgres.
//
// 운영 DB에 쓰지 않고, 이 PC에 설치된 Postgres(initdb·pg_ctl)로 임시 클러스터를 띄워
// 실제 SQL(마이그레이션·라우트 쿼리)을 돌린다. 새 npm 패키지 없이 쓰기 위해
//  - Postgres 연결은 작은 wire protocol 클라이언트(아래 PgConn)로,
//  - lib/db.ts의 neon()은 그대로 두고 neonConfig.fetchFunction만 바꿔서
//    neon HTTP 요청({query, params} / {queries})을 이 연결로 실행한다.
// 그래서 파라미터 직렬화·결과 타입 변환(timestamptz → Date, int8 → string, jsonb → 객체)은 운영과 같다.
//
// initdb가 없으면 hasLocalPostgres()가 false → 테스트는 건너뛴다(describe.skipIf).

import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"

// ── 설치 확인 ─────────────────────────────────────────────────────────────────

function findBin(name: string): string | null {
  const candidates = [process.env.PG_BIN_DIR, "/opt/homebrew/bin", "/usr/local/bin", "/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin"]
  for (const dir of candidates) {
    if (!dir) continue
    const p = path.join(dir, name)
    if (spawnSync(p, ["--version"], { stdio: "ignore" }).status === 0) return realpathSync(p)
  }
  const r = spawnSync("which", [name], { encoding: "utf8" })
  // 심볼릭 링크(homebrew)를 풀어야 initdb가 share 디렉터리를 제대로 찾는다.
  return r.status === 0 && r.stdout.trim() ? realpathSync(r.stdout.trim()) : null
}

export function hasLocalPostgres(): boolean {
  if (process.env.MESSENGER_PG_TESTS === "0") return false
  return !!findBin("initdb") && !!findBin("pg_ctl") && !!findBin("pg_config")
}

// initdb·postgres가 들어 있는 bin 디렉터리.
// homebrew 설치가 share 링크 없이 깨져 있으면(pg_config --sharedir에 postgres.bki가 없음) 실행 파일을
// 임시 디렉터리에 옮겨 두고 share·lib를 상대 경로로 이어 준다(Postgres는 실행 파일 위치 기준으로 share를 찾는다).
// 반환: tempRoot — 실행 파일을 옮겨 둔 임시 디렉터리(없으면 null). stop()이 지운다.
function resolvePgBinDir(): { binDir: string; tempRoot: string | null } {
  const pgConfig = findBin("pg_config")!
  const cfg = (flag: string) => execFileSync(pgConfig, [flag], { encoding: "utf8" }).trim()
  const bindir = cfg("--bindir")
  const sharedir = cfg("--sharedir")
  const pkglibdir = cfg("--pkglibdir")
  if (existsSync(path.join(sharedir, "postgres.bki"))) return { binDir: bindir, tempRoot: null }

  const realShare = path.join(bindir, "..", "share", "postgresql")
  const realLib = path.join(bindir, "..", "lib", "postgresql")
  if (!existsSync(path.join(realShare, "postgres.bki"))) throw new Error(`Postgres share 디렉터리를 찾지 못했습니다: ${sharedir}`)

  const a = bindir.split(path.sep)
  const b = sharedir.split(path.sep)
  let common = 0
  while (common < a.length && common < b.length && a[common] === b[common]) common++
  const prefix = a.slice(0, common).join(path.sep)
  const rel = (p: string) => path.relative(prefix, p)

  const root = mkdtempSync(path.join(os.tmpdir(), "pumsg-pgbin-"))
  const newBin = path.join(root, rel(bindir))
  mkdirSync(newBin, { recursive: true })
  for (const exe of ["initdb", "postgres", "pg_ctl"]) {
    copyFileSync(path.join(bindir, exe), path.join(newBin, exe))
    chmodSync(path.join(newBin, exe), 0o755)
  }
  for (const [target, link] of [[realShare, path.join(root, rel(sharedir))], [realLib, path.join(root, rel(pkglibdir))]] as const) {
    mkdirSync(path.dirname(link), { recursive: true })
    if (!existsSync(link)) symlinkSync(target, link)
  }
  return { binDir: newBin, tempRoot: root }
}

// ── 최소 wire protocol 클라이언트 ─────────────────────────────────────────────

interface Field {
  name: string
  dataTypeID: number
}
interface QueryResult {
  fields: Field[]
  rows: (string | null)[][]
  command: string
  rowCount: number
}
export class PgError extends Error {
  fields: Record<string, string>
  constructor(fields: Record<string, string>) {
    super(fields.message ?? "postgres error")
    this.fields = fields
  }
}

const ERROR_FIELD: Record<string, string> = {
  S: "severity", C: "code", M: "message", D: "detail", H: "hint", P: "position", W: "where",
  s: "schema", t: "table", c: "column", d: "dataType", n: "constraint", F: "file", L: "line", R: "routine",
}

function cstr(s: string): Buffer {
  return Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])])
}
function msg(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(5)
  head.write(type, 0, "ascii")
  head.writeInt32BE(body.length + 4, 1)
  return Buffer.concat([head, body])
}
function int16(n: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeInt16BE(n)
  return b
}
function int32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeInt32BE(n)
  return b
}

type Incoming = { type: string; body: Buffer }

export class PgConn {
  private sock: net.Socket
  private buf = Buffer.alloc(0)
  private waiters: ((m: Incoming) => void)[] = []
  private queue: Incoming[] = []
  private chain: Promise<unknown> = Promise.resolve()

  private constructor(sock: net.Socket) {
    this.sock = sock
    sock.on("data", (d) => {
      this.buf = Buffer.concat([this.buf, d])
      while (this.buf.length >= 5) {
        const len = this.buf.readInt32BE(1)
        if (this.buf.length < len + 1) break
        const m = { type: String.fromCharCode(this.buf[0]), body: this.buf.subarray(5, len + 1) }
        this.buf = this.buf.subarray(len + 1)
        const w = this.waiters.shift()
        if (w) w(m)
        else this.queue.push(m)
      }
    })
  }

  private next(): Promise<Incoming> {
    const m = this.queue.shift()
    if (m) return Promise.resolve(m)
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  static async connect(port: number, user: string, database: string): Promise<PgConn> {
    const sock = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host: "127.0.0.1", port }, () => resolve(s))
      s.once("error", reject)
    })
    const conn = new PgConn(sock)
    const params = Buffer.concat([cstr("user"), cstr(user), cstr("database"), cstr(database), cstr("client_encoding"), cstr("UTF8"), Buffer.from([0])])
    const body = Buffer.concat([int32(196608), params])
    sock.write(Buffer.concat([int32(body.length + 4), body]))
    for (;;) {
      const m = await conn.next()
      if (m.type === "R" && m.body.readInt32BE(0) !== 0) throw new Error("로컬 Postgres는 trust 인증이어야 합니다")
      if (m.type === "E") throw new PgError(parseError(m.body))
      if (m.type === "Z") break
    }
    return conn
  }

  // 직렬 실행(한 연결을 여러 요청이 동시에 쓰지 않도록)
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.catch(() => undefined)
    return run
  }

  private async readUntilReady(): Promise<{ results: QueryResult[]; error: PgError | null }> {
    const results: QueryResult[] = []
    let cur: QueryResult = { fields: [], rows: [], command: "", rowCount: 0 }
    let error: PgError | null = null
    for (;;) {
      const m = await this.next()
      switch (m.type) {
        case "T": {
          const n = m.body.readInt16BE(0)
          let off = 2
          const fields: Field[] = []
          for (let i = 0; i < n; i++) {
            const end = m.body.indexOf(0, off)
            const name = m.body.toString("utf8", off, end)
            off = end + 1
            const typeOid = m.body.readInt32BE(off + 6)
            off += 18
            fields.push({ name, dataTypeID: typeOid })
          }
          cur.fields = fields
          break
        }
        case "D": {
          const n = m.body.readInt16BE(0)
          let off = 2
          const row: (string | null)[] = []
          for (let i = 0; i < n; i++) {
            const len = m.body.readInt32BE(off)
            off += 4
            if (len === -1) row.push(null)
            else {
              row.push(m.body.toString("utf8", off, off + len))
              off += len
            }
          }
          cur.rows.push(row)
          break
        }
        case "C": {
          cur.command = m.body.toString("utf8", 0, m.body.length - 1)
          const last = Number(cur.command.split(" ").pop())
          cur.rowCount = Number.isFinite(last) ? last : cur.rows.length
          results.push(cur)
          cur = { fields: [], rows: [], command: "", rowCount: 0 }
          break
        }
        case "I":
          results.push(cur)
          cur = { fields: [], rows: [], command: "", rowCount: 0 }
          break
        case "E":
          error = new PgError(parseError(m.body))
          break
        case "Z":
          return { results, error }
        default:
          // 1 ParseComplete, 2 BindComplete, n NoData, t ParameterDescription, N Notice, S ParameterStatus …
          break
      }
    }
  }

  // 단순 질의(여러 문장 가능) — 마이그레이션·테스트 준비용
  simple(text: string): Promise<QueryResult[]> {
    return this.serial(async () => {
      this.sock.write(msg("Q", cstr(text)))
      const { results, error } = await this.readUntilReady()
      if (error) throw error
      return results
    })
  }

  private async extendedOnce(text: string, params: (string | null)[]): Promise<{ result: QueryResult | null; error: PgError | null }> {
    const bindParts: Buffer[] = [cstr(""), cstr(""), int16(0), int16(params.length)]
    for (const p of params) {
      if (p === null) bindParts.push(int32(-1))
      else {
        const b = Buffer.from(p, "utf8")
        bindParts.push(int32(b.length), b)
      }
    }
    bindParts.push(int16(0))
    this.sock.write(
      Buffer.concat([
        msg("P", Buffer.concat([cstr(""), cstr(text), int16(0)])),
        msg("B", Buffer.concat(bindParts)),
        msg("D", Buffer.concat([Buffer.from("P"), cstr("")])),
        msg("E", Buffer.concat([cstr(""), int32(0)])),
        msg("S", Buffer.alloc(0)),
      ]),
    )
    const { results, error } = await this.readUntilReady()
    return { result: results[0] ?? { fields: [], rows: [], command: "", rowCount: 0 }, error }
  }

  query(text: string, params: (string | null)[]): Promise<QueryResult> {
    return this.serial(async () => {
      const { result, error } = await this.extendedOnce(text, params)
      if (error) throw error
      return result!
    })
  }

  transaction(queries: { query: string; params: (string | null)[] }[]): Promise<QueryResult[]> {
    return this.serial(async () => {
      const begin = async (t: string) => {
        this.sock.write(msg("Q", cstr(t)))
        const r = await this.readUntilReady()
        if (r.error) throw r.error
      }
      await begin("BEGIN")
      const out: QueryResult[] = []
      for (const q of queries) {
        const { result, error } = await this.extendedOnce(q.query, q.params)
        if (error) {
          await begin("ROLLBACK")
          throw error
        }
        out.push(result!)
      }
      await begin("COMMIT")
      return out
    })
  }

  close(): void {
    try {
      this.sock.write(msg("X", Buffer.alloc(0)))
    } catch {
      // 이미 닫힘
    }
    this.sock.destroy()
  }
}

function parseError(body: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  let off = 0
  while (off < body.length && body[off] !== 0) {
    const code = String.fromCharCode(body[off])
    const end = body.indexOf(0, off + 1)
    out[ERROR_FIELD[code] ?? code] = body.toString("utf8", off + 1, end)
    off = end + 1
  }
  return out
}

// ── 임시 클러스터 ─────────────────────────────────────────────────────────────

export interface LocalPg {
  conn: PgConn
  port: number
  databaseUrl: string
  // neonConfig.fetchFunction에 넣을 함수
  fetchFunction: (url: string, init: { body: string }) => Promise<Response>
  // 쿼리 수 세기(성능 회귀 감시용)
  stats: { queries: number }
  stop: () => void
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
    srv.once("error", reject)
  })
}

export async function startLocalPg(): Promise<LocalPg> {
  const { binDir, tempRoot } = resolvePgBinDir()
  const initdb = path.join(binDir, "initdb")
  const pgCtl = path.join(binDir, "pg_ctl")
  const dir = mkdtempSync(path.join(os.tmpdir(), "pumsg-"))
  const data = path.join(dir, "data")
  execFileSync(initdb, ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-locale", "--no-sync"], { stdio: "ignore" })
  const port = await freePort()
  // 소켓 파일은 만들지 않고(경로 길이 문제) TCP만 연다. 속도를 위해 fsync 끔.
  writeFileSync(
    path.join(data, "postgresql.auto.conf"),
    `port = ${port}\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\nfsync = off\nsynchronous_commit = off\nfull_page_writes = off\ntimezone = 'Asia/Seoul'\n`,
  )
  execFileSync(pgCtl, ["-D", data, "-l", path.join(dir, "log.txt"), "-w", "start"], { stdio: "ignore" })
  const stop = () => {
    try {
      execFileSync(pgCtl, ["-D", data, "-m", "immediate", "stop"], { stdio: "ignore" })
    } catch {
      // 이미 멈춤
    }
    // 임시 클러스터·옮겨 둔 실행 파일 정리
    for (const d of [dir, tempRoot]) {
      if (!d) continue
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        // 무시
      }
    }
  }
  let conn: PgConn
  try {
    conn = await PgConn.connect(port, "postgres", "postgres")
  } catch (e) {
    stop()
    throw e
  }
  const stats = { queries: 0 }

  const fetchFunction = async (_url: string, init: { body: string }): Promise<Response> => {
    const payload = JSON.parse(init.body) as { query?: string; params?: (string | null)[]; queries?: { query: string; params: (string | null)[] }[] }
    const toJson = (r: QueryResult) => ({ fields: r.fields, rows: r.rows, command: r.command.split(" ")[0], rowCount: r.rowCount, rowAsArray: true })
    try {
      if (payload.queries) {
        stats.queries += payload.queries.length
        const results = await conn.transaction(payload.queries.map((q) => ({ query: q.query, params: q.params.map(asParam) })))
        return jsonResponse(200, { results: results.map(toJson) })
      }
      stats.queries++
      const r = await conn.query(payload.query ?? "", (payload.params ?? []).map(asParam))
      return jsonResponse(200, toJson(r))
    } catch (e) {
      if (e instanceof PgError) return jsonResponse(400, e.fields)
      return jsonResponse(500, { message: String(e) })
    }
  }

  return {
    conn,
    port,
    databaseUrl: `postgresql://postgres:test@127.0.0.1:${port}/postgres`,
    fetchFunction,
    stats,
    stop: () => {
      conn.close()
      stop()
    },
  }
}

function asParam(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return typeof v === "string" ? v : String(v)
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

// 저장소의 마이그레이션 파일을 그대로 적용한다(여러 문장).
export async function applyMigration(conn: PgConn, relPath: string): Promise<void> {
  const text = readFileSync(path.join(process.cwd(), relPath), "utf8")
  await conn.simple(text)
}
