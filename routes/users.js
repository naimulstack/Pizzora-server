
import { ObjectId } from "mongodb";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

export default function userRoutes(app, db) {
  const usersCollection = db.collection("user");

  const auth = requireAuth(db);
  const adminOnly = requireAdmin(db);

  // Get All Users — admin only
  app.get("/users", ...adminOnly, async (req, res) => {
    try {
      const users = await usersCollection
        .find({}, {
          projection: {
            password: 0,
          },
        })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(users);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch users" });
    }
  });

  // profile update
  app.patch("/user/profile", auth, async (req, res) => {
    try {
      const { name, image } = req.body || {};

      const setFields = {};
      if (typeof name === "string" && name.trim()) {
        setFields.name = name.trim();
      }
      if (typeof image === "string") {
        setFields.image = image;
      }
      setFields.updatedAt = new Date();

      await usersCollection.updateOne(
        { _id: req.user._id },
        { $set: setFields }
      );

      res.send({
        success: true,
        message: "Profile updated",
        user: { ...req.user, ...setFields },
      });
    } catch (error) {
      res.status(500).send({ message: "Failed to update profile" });
    }
  });

  app.patch("/users/:id", auth, async (req, res) => {
    try {
      const { id } = req.params;
      const isAdmin =
        String(req.user?.role || "").toLowerCase() === "admin";

      if (!isAdmin && String(req.user._id) !== id) {
        return res.status(403).send({ message: "Access denied" });
      }

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ message: "Invalid user ID" });
      }

      const { name, image } = req.body || {};

      const setFields = {};
      if (typeof name === "string" && name.trim()) {
        setFields.name = name.trim();
      }
      if (typeof image === "string") {
        setFields.image = image;
      }
      setFields.updatedAt = new Date();

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: setFields }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send({ success: true, message: "Profile updated" });
    } catch (error) {
      res.status(500).send({ message: "Failed to update profile" });
    }
  });



  // Register as Vendor
app.patch("/user/register-vendor", auth, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      return res.status(403).send({
        message: "Admin cannot register as vendor",
      });
    }

    if (req.user.role === "vendor") {
      return res.send({
        success: true,
        message: "Already registered as vendor",
      });
    }

    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt);
    trialEndsAt.setMonth(trialEndsAt.getMonth() + 1);

    await usersCollection.updateOne(
      { _id: req.user._id },
      {
        $set: {
          role: "vendor",
          updatedAt: new Date(),
        },
      }
    );

    res.send({
      success: true,
      message: "Vendor registration successful",
      role: "vendor",
      trialStartedAt,
      trialEndsAt,
    });
  } catch (error) {
    res.status(500).send({
      message: "Vendor registration failed",
    });
  }
});

app.get("/test-user-route", (req, res) => {
  res.send("Users route is working");
});
}
