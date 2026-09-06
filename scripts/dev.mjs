import { spawn, execSync } from 'node:child_process'
import net from 'node:net'

const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5433', 10)
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6380', 10)

/** Check if a TCP port is open and accepting connections */
function isPortOpen(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, host)
  })
}

/** Sleep helper */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function ensureServices() {
  const isPgOpen = await isPortOpen(PG_PORT)
  const isRedisOpen = await isPortOpen(REDIS_PORT)

  if (isPgOpen && isRedisOpen) {
    console.log(`\x1b[32m[Services]\x1b[0m PostgreSQL (:5433) and Redis (:6380) are already running and healthy.`)
    return
  }

  console.log(`\x1b[33m[Services]\x1b[0m Starting local PostgreSQL (:5433) and Redis (:6380) via Docker Compose...`)

  try {
    execSync('docker compose up -d', { stdio: 'inherit' })
  } catch (err) {
    console.warn(`\x1b[31m[Warning]\x1b[0m Could not run 'docker compose up -d'. Ensure Docker Desktop is running.`)
  }

  // Poll until services are accepting connections (up to 20 seconds)
  const startTime = Date.now()
  while (Date.now() - startTime < 20000) {
    const pg = await isPortOpen(PG_PORT)
    const redis = await isPortOpen(REDIS_PORT)
    if (pg && redis) {
      console.log(`\x1b[32m[Services]\x1b[0m Database and Redis are now connected and ready.`)
      return
    }
    await sleep(800)
  }

  console.warn(`\x1b[33m[Notice]\x1b[0m Services did not respond within 20s. Next.js will boot; verify Docker Desktop if DB errors occur.`)
}

async function main() {
  await ensureServices()

  console.log(`\x1b[36m[Orientation 2026]\x1b[0m Launching Next.js Web Dev Server...\n`)
  const nextProcess = spawn('npm', ['run', 'dev', '--workspace=@orientation/web'], {
    stdio: 'inherit',
    shell: true,
  })

  process.on('SIGINT', () => {
    nextProcess.kill('SIGINT')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    nextProcess.kill('SIGTERM')
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('[Error in dev launcher]', err)
  process.exit(1)
})
