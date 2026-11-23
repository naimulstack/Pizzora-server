
import { ObjectId } from "mongodb";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

const ALLOWED_STATUSES = [
  "pending",
  "accepted",
  "approved",
  "processing",
  "delivered",
  "completed",
  "rejected",
  "cancelled",
  "canceled",
];

export default function vendorRoutes(app, db) {
  const pizzasCollection = db.collection("pizzas");
  const ordersCollection = db.collection("orders");
  const usersCollection = db.collection("user");

  const auth = requireAuth(db);
  const admin = requireAdmin(db);

  // Vendor Filter
  const vendorFilter = (email) => ({
    $or: [
      { vendorEmail: email },
      { "items.vendorEmail": email },
    ],
  });

  // Vendor Stats
  app.get("/vendor/stats", auth, async (req, res) => {
    const filter = vendorFilter(req.user.email);

    const [pizzas, orders] = await Promise.all([
      pizzasCollection.find(filter).toArray(),
      ordersCollection.find(filter).toArray(),
    ]);

    const deliveredOrders = orders.filter((o) =>
      ["delivered", "completed"].includes(o.status?.toLowerCase())
    );

    return res.send({
      totalPizzas: pizzas.length,
      approvedPizzas: pizzas.filter((p) => p.status === "approved").length,
      pendingPizzas: pizzas.filter((p) => !p.status || p.status === "pending").length,
      rejectedPizzas: pizzas.filter((p) => p.status === "rejected").length,
      totalOrders: orders.length,
      pendingOrders: orders.filter((o) =>
        ["pending", "processing"].includes(o.status?.toLowerCase() || "pending")
      ).length,
      completedOrders: deliveredOrders.length,
      totalRevenue: deliveredOrders.reduce((sum, order) => {
        const items = (order.items || []).filter(
          (item) => item.vendorEmail === req.user.email
        );

        const amount = items.length
          ? items.reduce(
              (total, item) =>
                total +
                Number(item.price || 0) * Number(item.quantity || 1),
              0
            )
          : Number(order.totalPrice || 0);

        return sum + amount;
      }, 0),
    });
  });

  // Vendor Orders
  app.get("/vendor/orders", auth, async (req, res) => {
    const orders = await ordersCollection
      .find(vendorFilter(req.user.email))
      .sort({ createdAt: -1 })
      .toArray();

    return res.send(orders);
  });

  // Update Order Status
  app.patch("/vendor/orders/:id/status", auth, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid order ID" });
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).send({ message: "Invalid order status" });
    }

    const filter = { _id: new ObjectId(id) };

    if (req.user.role !== "admin") {
      filter.$or = vendorFilter(req.user.email).$or;
    }

    const order = await ordersCollection.findOne(filter);

    if (!order) {
      return res.status(404).send({ message: "Order not found" });
    }

    const now = new Date();

    await ordersCollection.updateOne(filter, {
      $set: {
        status,
        updatedAt: now,
        ...(status === "delivered" ? { deliveredAt: now } : {}),
      },
    });

    return res.send({
      success: true,
      message: "Order status updated",
    });
  });

  // Vendor Subscription / Plan info
  app.get("/vendor/subscription", auth, async (req, res) => {
    try {
      const email = String(req.user?.email || "").trim().toLowerCase();
      const now = new Date();
      const FREE_LIMIT = 3;
      const PRICE = 30000;
      const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

      const vendor = await usersCollection.findOne({
        email: { $regex: `^${email}$`, $options: "i" },
      });

      if (!vendor) {
        return res.status(404).send({
          success: false,
          message: "Vendor not found",
        });
      }

      // পুরনো vendor-দের জন্য trial backfill (feature আসার আগে approve হওয়া)
      if (
        !vendor.subscriptionExpiresAt &&
        !vendor.trialEndsAt &&
        vendor.subscriptionPlan !== "premium"
      ) {
        const trialEnd = new Date(now.getTime() + MONTH_MS);
        await usersCollection.updateOne(
          { _id: vendor._id },
          {
            $set: {
              subscriptionPlan: "free",
              subscriptionStartedAt: now,
              trialEndsAt: trialEnd,
              updatedAt: now,
            },
          }
        );
        vendor.subscriptionPlan = "free";
        vendor.subscriptionStartedAt = now;
        vendor.trialEndsAt = trialEnd;
      }

      const expiresAt = vendor.subscriptionExpiresAt
        ? new Date(vendor.subscriptionExpiresAt)
        : null;
      const trialEndsAt = vendor.trialEndsAt
        ? new Date(vendor.trialEndsAt)
        : null;

      const isPremium =
        vendor.subscriptionPlan === "premium" &&
        expiresAt &&
        expiresAt > now;

      const trialActive = !isPremium && (!trialEndsAt || trialEndsAt > now);
      const trialEnded = !isPremium && trialEndsAt && trialEndsAt <= now;

      const pizzaCount = await pizzasCollection.countDocuments({
        vendorEmail: email,
        isAvailable: true,
        status: { $in: ["approved", "pending"] },
      });

      const canAddPizza =
        isPremium || (trialActive && pizzaCount < FREE_LIMIT);

      const nextRenewalDate = isPremium
        ? expiresAt
        : trialActive
          ? trialEndsAt
          : null;

      res.send({
        success: true,
        plan: isPremium ? "premium" : "free",
        status: isPremium
          ? "premium_active"
          : trialActive
            ? "trial"
            : "trial_expired",
        price: PRICE,
        currency: "BDT",
        billingDays: 30,
        freeLimit: FREE_LIMIT,
        pizzaCount,
        canAddPizza,
        trialEndsAt: trialEndsAt || null,
        trialDaysLeft: trialEndsAt
          ? Math.max(
              0,
              Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000)
            )
          : 0,
        subscriptionStartedAt: vendor.subscriptionStartedAt || null,
        subscriptionExpiresAt: expiresAt || null,
        subscriptionPaidAt: vendor.subscriptionPaidAt || null,
        daysLeft: expiresAt
          ? Math.max(
              0,
              Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000)
            )
          : 0,
        nextRenewalDate,
        nextPayment:
          isPremium && expiresAt
            ? { amount: PRICE, dueAt: expiresAt, currency: "BDT" }
            : null,
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Failed to load subscription",
      });
    }
  });

  // Admin: All Vendors
  app.get("/admin/vendors", ...admin, async (req, res) => {
    const { search = "", status = "All" } = req.query;

    const query = { role: "vendor" };

    if (status !== "All") query.status = status;

    if (search.trim()) {
      const regex = new RegExp(
        search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );

      query.$or = [
        { companyName: regex },
        { name: regex },
        { email: regex },
      ];
    }

    const vendors = await usersCollection
      .find(query, { projection: { password: 0, token: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    return res.send(vendors);
  });
}
