import 'dotenv/config';
import { Client, TablesDB, Teams, Users, Functions } from 'node-appwrite';

for (const k of ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY']) {
  if (!process.env[k]) throw new Error(`Missing ${k}. Copy .env.example to .env and fill it in.`);
}
export const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
export const tables = new TablesDB(client);
export const teams = new Teams(client);
export const users = new Users(client);
export const functions = new Functions(client);
