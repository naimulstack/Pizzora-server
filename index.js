import "dotenv/config";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { db, connectToMongoDB } from "./lib/mongodb.js";

import pizzaRoutes from "./routes/pizzas.js";
import adminRoutes from "./routes/admin.js";
import vendorRoutes from "./routes/vendor.js";
import vendorRequestRoutes from "./routes/vendor-request.js";
import orderRoutes from "./routes/orders.js";
import notificationRoutes from "./routes/notification.js";
import customerRoutes from "./routes/customer.js";
import userRoutes from "./routes/users.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://pizzora-client.vercel.app",
    ],
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT"],
    credentials: true,
  })
);

app.use(async (req, res, next) => {
  try {
    await connectToMongoDB();
    next();
  } catch (error) {
    console.error("MongoDB Connection Error:", error.message);

    res.status(500).send({
      success: false,
      message: "Database connection failed",
    });
  }
});

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Pizzora Server is running");
});

pizzaRoutes(app, db);
adminRoutes(app, db);
vendorRoutes(app, db);
vendorRequestRoutes(app, db);
orderRoutes(app, db);
notificationRoutes(app, db);
customerRoutes(app, db);
userRoutes(app, db);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);

  res.status(err.status || 500).send({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

if (!process.env.VERCEL) {
  connectToMongoDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Server startup failed:", error);
    });
}

export default app;