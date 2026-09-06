import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const database = new PrismaClient();
const expected = "factoryflow_verification";
try {
  const columns = await database.$queryRaw`SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema IN ('public', ${expected}) AND table_name <> '_prisma_migrations' ORDER BY table_name, ordinal_position`;
  const constraints = await database.$queryRaw`SELECT n.nspname AS schema, t.relname AS table, c.conname AS name, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname IN ('public', ${expected}) AND t.relname <> '_prisma_migrations'`;
  const indexes = await database.$queryRaw`SELECT schemaname AS schema, tablename AS table, indexname AS name, indexdef AS definition
    FROM pg_indexes WHERE schemaname IN ('public', ${expected}) AND tablename <> '_prisma_migrations'`;
  const result = {};
  for (const [kind, records, scopeKey, idKeys] of [["columns",columns,"table_schema",["table_name","column_name"]],["constraints",constraints,"schema",["table","name"]],["indexes",indexes,"schema",["table","name"]]]) {
    const normalize = record => JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k]) => k !== scopeKey).map(([k,v]) => [k, typeof v === "string" ? v.replaceAll(expected + ".", "").replaceAll("public.", "") : v])));
    const source = new Map(records.filter(r => r[scopeKey] === "public").map(r => [idKeys.map(k => r[k]).join("."), normalize(r)]));
    const target = new Map(records.filter(r => r[scopeKey] === expected).map(r => [idKeys.map(k => r[k]).join("."), normalize(r)]));
    result[kind] = { missing: [...target.keys()].filter(k => !source.has(k)), extra: [...source.keys()].filter(k => !target.has(k)), different: [...target.keys()].filter(k => source.has(k) && source.get(k) !== target.get(k)) };
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} finally { await database.$disconnect(); }

