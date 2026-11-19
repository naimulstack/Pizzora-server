import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import userRoutes from "./routes/users.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

let pizzasCollection;
let usersCollection;

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("MongoDB Connected");

    const db = client.db("pizzora");

    pizzasCollection = db.collection("pizzas");
    usersCollection = db.collection("user");

    userRoutes(app, db);

    return db;
  } catch (error) {
    console.log(error);
    throw error;
  }
}

// All Pizza
app.get("/pizzas", async (req, res) => {
  try {
    const result = await pizzasCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch pizzas" });
  }
});

// Get Single Pizza
app.get("/pizzas/:id", async (req, res) => {
  const { id } = req.params;
  const pizza = await pizzasCollection.findOne({ _id: new ObjectId(id) });
  res.send(pizza);
});

// Add New Pizza
app.post("/pizzas", async (req, res) => {
  const pizzaData = { ...req.body, createdAt: new Date() };
  const result = await pizzasCollection.insertOne(pizzaData);
  res.send(result);
});

// Update Pizza
app.patch("/pizzas/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body, updatedAt: new Date() };
  const result = await pizzasCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData },
  );
  res.send(result);
});

// Delete Pizza
app.delete("/pizzas/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pizzasCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// Admin Dashboard Statistics
app.get("/admin/stats", async (req, res) => {
  try {
    const [totalUsers, totalPizzas] = await Promise.all([
      usersCollection.countDocuments(),
      pizzasCollection.countDocuments(),
    ]);

    res.send({
      totalUsers,
      totalPizzas,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch dashboard statistics",
    });
  }
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
