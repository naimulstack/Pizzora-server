
import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { MongoClient } from "mongodb";
import { auth } from "./lib/auth.js";
import pizzaRoutes from "./routes/pizzas.js";
import adminRoutes from "./routes/admin.js";

const app = express();
const PORT = process.env.PORT || 5000;
const client = new MongoClient(process.env.MONGODB_URI);

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

export async function connectToMongoDB() {
  await client.connect();
  console.log("MongoDB Connected");
  return client.db("pizzora");
}

app.get("/", (req, res) => {
  res.send("Pizzora Server is running");
});

const startServer = async () => {
  const db = await connectToMongoDB();

  pizzaRoutes(app, db);
  adminRoutes(app, db);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
