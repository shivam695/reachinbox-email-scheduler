import { PrismaClient } from "@prisma/client";

// This one object is our single connection to the database.
// We reuse it everywhere instead of creating new connections each time.
export const prisma = new PrismaClient();