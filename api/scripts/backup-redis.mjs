#!/usr/bin/env node
/**
 * Read-only snapshot of the production Upstash Redis, for a pre-deploy backup.
 *
 * It ONLY issues read commands (SCAN, TYPE, HGETALL, SMEMBERS, ZRANGE,
 * GET, LRANGE) — it never writes, deletes, or expires anything. Output is a
 * single JSON file you can keep or restore from.
 *
 * Usage (run from the host, with PRODUCTION creds — never commit them):
 *   UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io \
 *   UPSTASH_REDIS_REST_TOKEN=*** \
 *   node api/scripts/backup-redis.mjs > backups/redis-$(date +%Y%m%d-%H%M%S).json
 *
 * Tip: run it before AND after a deploy and `diff` the two — a code-only Worker
 * deploy must leave the data byte-for-byte identical.
 */

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!URL || !TOKEN) {
  console.error("Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}

async function cmd(command) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Redis ${command[0]}: ${data.error}`);
  return data.result;
}

async function scanAll() {
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await cmd(["SCAN", cursor, "COUNT", "500"]);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== "0");
  return keys;
}

async function dumpKey(key) {
  const type = await cmd(["TYPE", key]);
  switch (type) {
    case "string": return { type, value: await cmd(["GET", key]) };
    case "hash":   return { type, value: await cmd(["HGETALL", key]) };
    case "set":    return { type, value: await cmd(["SMEMBERS", key]) };
    case "zset":   return { type, value: await cmd(["ZRANGE", key, "0", "-1", "WITHSCORES"]) };
    case "list":   return { type, value: await cmd(["LRANGE", key, "0", "-1"]) };
    default:       return { type, value: null, note: "unsupported type, skipped" };
  }
}

const keys = await scanAll();
const data = {};
for (const key of keys) data[key] = await dumpKey(key);

console.error(`Backed up ${keys.length} keys.`);
process.stdout.write(JSON.stringify({ takenAt: new Date().toISOString(), keyCount: keys.length, keys: data }, null, 2));
