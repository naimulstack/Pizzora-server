
import { ObjectId } from "mongodb";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

export default function pizzaRoutes(app, db) {
  const pizzasCollection = db.collection("pizzas");
  const notificationsCollection = db.collection("notifications");
  const userCollection = db.collection("user");
  const usersCollection = db.collection("users");

  const auth = requireAuth(db);
  const adminOnly = requireAdmin(db);

  app.get("/pizzas", async (req, res) => {
    const pizzas = await pizzasCollection
      .find({ status: "approved" })
      .sort({ createdAt: -1 })
      .toArray();

    // Free/non-premium vendor-দের মেনুতে সর্বশেষ ৩টা pizza ছাড়া বাকি hidden
    // (premium নিলে সব আবার দেখাবে — কিছু delete হয় না)
    try {
      const vendorEmails = [
        ...new Set(
          pizzas
            .map((p) => String(p.vendorEmail || "").trim().toLowerCase())
            .filter(Boolean)
        ),
      ];

      if (vendorEmails.length) {
        const vendorUsers = await userCollection
          .find({
            email: {
              $in: vendorEmails.map(
                (e) =>
                  new RegExp(
                    `^${e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
                    "i"
                  )
              ),
            },
          })
          .toArray();

        const premiumEmails = new Set(
          vendorUsers
            .filter(
              (u) =>
                u.subscriptionPlan === "premium" &&
                u.subscriptionExpiresAt &&
                new Date(u.subscriptionExpiresAt) > new Date()
            )
            .map((u) => String(u.email || "").trim().toLowerCase())
        );

        const counts = {};
        const filtered = pizzas.filter((p) => {
          const key = String(p.vendorEmail || "").trim().toLowerCase();
          if (!key || premiumEmails.has(key)) return true;
          counts[key] = (counts[key] || 0) + 1;
          return counts[key] <= 3;
        });

        return res.send(filtered);
      }
    } catch {
      // fallback: filter না হলে সব দেখাও
    }

    res.send(pizzas);
  });

  app.get("/pizzas/:id", async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid pizza ID" });
    }

    const pizza = await pizzasCollection.findOne({
      _id: new ObjectId(id),
      status: "approved",
    });

    if (!pizza) {
      return res.status(404).send({ message: "Pizza not found" });
    }

    res.send(pizza);
  });

  app.post("/vendor/pizzas", auth, async (req, res) => {
    const email = String(req.user.email).trim().toLowerCase();

    if (req.user.role !== "vendor") {
      return res.status(403).send({
        code: "VENDOR_ONLY",
        message: "Only vendors can add pizzas.",
      });
    }

    const vendor =
      (await userCollection.findOne({
        email: { $regex: `^${email}$`, $options: "i" },
      })) ||
      (await usersCollection.findOne({
        email: { $regex: `^${email}$`, $options: "i" },
      })) ||
      req.user;

    const expiresAt = vendor.subscriptionExpiresAt
      ? new Date(vendor.subscriptionExpiresAt)
      : null;

    const isPremium =
      vendor.subscriptionPlan === "premium" &&
      expiresAt &&
      expiresAt > new Date();

    // ১ মাস free trial শেষে payment না করলে নতুন pizza যোগ যাবে না
    const trialEndsAt = vendor.trialEndsAt
      ? new Date(vendor.trialEndsAt)
      : null;
    const trialEnded =
      !isPremium && trialEndsAt && trialEndsAt <= new Date();

    if (trialEnded) {
      return res.status(403).send({
        code: "TRIAL_ENDED",
        message:
          "Your free trial has ended. Subscribe to Premium to add more pizzas.",
      });
    }

    const activePizzaCount = await pizzasCollection.countDocuments({
      vendorEmail: email,
      isAvailable: true,
      status: { $in: ["approved", "pending"] },
    });

    if (!isPremium && activePizzaCount >= 3) {
      return res.status(403).send({
        code: "PLAN_LIMIT_REACHED",
        message: "Free Plan allows only 3 active pizzas.",
      });
    }

    const {
      name,
      category,
      price,
      discountPrice,
      image,
      description,
      ingredients,
      sizes,
      preparationTime,
      location,
      isAvailable,
    } = req.body;

    const now = new Date();

    const pizzaData = {
      name,
      category,
      price: Number(price),
      discountPrice: Number(discountPrice) || null,
      image,
      description,
      ingredients,
      sizes,
      preparationTime: Number(preparationTime) || 20,
      location,
      isAvailable: isAvailable ?? true,
      vendorId: String(req.user._id),
      vendorEmail: email,
      vendorName: req.user.name,
      companyName: vendor.companyName || "",
      status: "pending",
      rejectionReason: "",
      createdAt: now,
      updatedAt: now,
    };

    const result = await pizzasCollection.insertOne(pizzaData);

    await notificationsCollection.insertOne({
      recipientRole: "admin",
      type: "pizza_request",
      title: "New Pizza Approval Request",
      message: `${req.user.name} submitted a new pizza: ${name}`,
      pizzaId: result.insertedId,
      isRead: false,
      createdAt: now,
    });

    res.status(201).send({
      success: true,
      message: "Pizza submitted for admin approval",
      insertedId: result.insertedId,
    });
  });

  app.get("/vendor/pizzas", auth, async (req, res) => {
    const pizzas = await pizzasCollection
      .find({ vendorEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(pizzas);
  });

  // Vendor নিজের pizza মুছবে — শুধু নিজের / admin
  app.delete("/vendor/pizzas/:id", auth, async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid pizza ID" });
      }

      const isAdmin =
        String(req.user?.role || "").toLowerCase() === "admin";

      const query = isAdmin
        ? { _id: new ObjectId(id) }
        : {
            _id: new ObjectId(id),
            $or: [
              { vendorEmail: req.user?.email },
              { email: req.user?.email },
              { sellerEmail: req.user?.email },
              { vendorId: String(req.user?._id || "") },
            ],
          };

      const result = await pizzasCollection.deleteOne(query);

      if (result.deletedCount === 0) {
        return res.status(404).send({
          success: false,
          message: "Pizza not found or not yours",
        });
      }

      res.send({ success: true, message: "Pizza deleted" });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Failed to delete pizza",
      });
    }
  });

  // Admin delete pizza
  app.delete("/pizzas/:id", ...adminOnly, async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid pizza ID" });
      }

      const result = await pizzasCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (result.deletedCount === 0) {
        return res
          .status(404)
          .send({ success: false, message: "Pizza not found" });
      }

      res.send({ success: true, message: "Pizza deleted" });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Failed to delete pizza",
      });
    }
  });
}
