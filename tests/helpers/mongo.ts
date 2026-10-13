import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Starts a throwaway MongoDB server (a real mongod binary, downloaded once and cached)
 * and points the app's database client at it. Call from beforeAll.
 */
export async function startTestMongo(): Promise<MongoMemoryServer> {
  const server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DB = "qr_studio_test";
  return server;
}
