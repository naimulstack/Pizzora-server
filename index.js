
import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

let pizzasCollection;

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("MongoDB Connected");

    const db = client.db("pizzora");
    pizzasCollection = db.collection("pizzas");

    return db;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

// All Pizza
// Link: http://localhost:5000/pizzas
app.get("/pizzas", async (req, res) => {
    const result = await pizzasCollection.find().toArray();
    res.send(result);
});

app.get("/", (req, res) => {
  res.send("Server is running");
});

const startServer = async () => {
  await connectToMongoDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
