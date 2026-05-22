import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

/**
 * 双模数据库连接：
 *   - 生产 / Vercel：设置 TURSO_DATABASE_URL（+ TURSO_AUTH_TOKEN）→ 走 libSQL adapter，连远端 Turso
 *   - 本地开发：不设置 TURSO_DATABASE_URL → Prisma 走 DATABASE_URL 指向的本地 SQLite 文件
 *
 * 关键：要让 Vercel 等无状态环境也能正确复用 prisma 单例，避免每次冷启动重建连接。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildPrisma(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const log = process.env.NODE_ENV === "development" ? (["warn", "error"] as const) : (["error"] as const);

  if (tursoUrl) {
    const libsql = createClient({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({ adapter, log: [...log] });
  }
  return new PrismaClient({ log: [...log] });
}

export const prisma = globalForPrisma.prisma ?? buildPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
