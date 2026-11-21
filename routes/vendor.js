import { ObjectId } from "mongodb";

const escapeRegex = (str = "") =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ALLOWED_ORDER_STATUSES = new Set([
  "pending",
  "accepted",
  "approved",
  "processing",
  "delivered",
  "completed",
  "rejected",
  "cancelled",
  "canceled",
]);

export default function vendorRoutes(app, db) {
  const pizzasCollection = db.collection("pizzas");
  const ordersCollection = db.collection("orders");

  const buildVendorFilter = ({
    email = "",
    vendor = "",
    shopName = "",
    userId = "",
  }) => {
    const conditions = [];
    const cleanEmail = String(email || "").trim();
    const cleanVendor = String(vendor || "").trim();
    const cleanShop = String(shopName || "").trim();
    const cleanUserId = String(userId || "").trim();

    if (cleanEmail) {
      const emailRegex = new RegExp(`^${escapeRegex(cleanEmail)}$`, "i");
      conditions.push(
        { vendorEmail: emailRegex },
        { email: emailRegex },
        { sellerEmail: emailRegex },
        { ownerEmail: emailRegex },
        { "items.vendorEmail": emailRegex },
        { "items.email": emailRegex },
        { "items.sellerEmail": emailRegex }
      );
    }

    if (cleanVendor) {
      const vendorRegex = new RegExp(escapeRegex(cleanVendor), "i");
      conditions.push(
        { vendor: vendorRegex },
        { vendorName: vendorRegex },
        { ownerName: vendorRegex },
        { "items.vendor": vendorRegex },
        { "items.vendorName": vendorRegex }
      );
    }

    if (cleanShop) {
      const shopRegex = new RegExp(escapeRegex(cleanShop), "i");
      conditions.push(
        { shopName: shopRegex },
        { vendorShopName: shopRegex },
        { "items.shopName": shopRegex },
        { "items.vendorShopName": shopRegex }
      );
    }

    if (cleanUserId) {
      conditions.push(
        { vendorId: cleanUserId },
        { userId: cleanUserId },
        { ownerId: cleanUserId },
        { "items.vendorId": cleanUserId },
        { "items.userId": cleanUserId }
      );
    }

    return conditions.length > 0 ? { $or: conditions } : {};
  };

  const calculateOrderAmountForVendor = (order, email = "") => {
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (Array.isArray(order.items) && order.items.length > 0 && cleanEmail) {
      const matchedItems = order.items.filter((item) => {
        const itemEmail = String(
          item.vendorEmail || item.email || item.sellerEmail || ""
        )
          .trim()
          .toLowerCase();
        return itemEmail === cleanEmail;
      });

      if (matchedItems.length > 0) {
        return matchedItems.reduce(
          (sum, item) =>
            sum +
            Number(item.price ?? item.unitPrice ?? 0) *
              Number(item.quantity ?? item.qty ?? 1),
          0
        );
      }
    }

    return Number(order.totalPrice ?? order.totalAmount ?? order.amount ?? 0);
  };

  // Vendor Stats
  app.get("/vendor/stats", async (req, res) => {
    try {
      const filter = buildVendorFilter(req.query);

      const [pizzas, orders] = await Promise.all([
        pizzasCollection.find(filter).toArray(),
        ordersCollection.find(filter).toArray(),
      ]);

      const totalPizzas = pizzas.length;
      const approvedPizzas = pizzas.filter(
        (p) => String(p.status || "").trim().toLowerCase() === "approved"
      ).length;
      const pendingPizzas = pizzas.filter(
        (p) =>
          (String(p.status || "pending").trim().toLowerCase()) === "pending"
      ).length;
      const rejectedPizzas = pizzas.filter(
        (p) => String(p.status || "").trim().toLowerCase() === "rejected"
      ).length;

      const totalOrders = orders.length;
      const pendingOrders = orders.filter((order) => {
        const st = String(order.status || "pending").trim().toLowerCase();
        return st === "pending" || st === "processing";
      }).length;

      const deliveredOrders = orders.filter((order) => {
        const st = String(order.status || "").trim().toLowerCase();
        return st === "delivered" || st === "completed";
      });

      const completedOrders = deliveredOrders.length;

      // Revenue শুধুমাত্র delivered/completed হওয়া অর্ডার থেকেই যোগ হবে
      const totalRevenue = deliveredOrders.reduce(
        (sum, order) => sum + calculateOrderAmountForVendor(order, req.query.email),
        0
      );

      res.send({
        totalPizzas,
        approvedPizzas,
        pendingPizzas,
        rejectedPizzas,
        totalOrders,
        pendingOrders,
        completedOrders,
        totalRevenue,
      });
    } catch (error) {
      res.status(500).send({
        message: "Failed to fetch vendor stats",
        error: error.message,
      });
    }
  });

  // Vendor Pizzas
  app.get("/vendor/pizzas", async (req, res) => {
    try {
      const filter = buildVendorFilter(req.query);
      const pizzas = await pizzasCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(pizzas);
    } catch (error) {
      res.status(500).send({
        message: "Failed to fetch vendor pizzas",
        error: error.message,
      });
    }
  });

  // Create Vendor Pizza
  app.post("/vendor/pizzas", async (req, res) => {
    try {
      const newPizza = {
        ...req.body,
        status: "pending",
        isActive: req.body.isAvailable !== false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await pizzasCollection.insertOne(newPizza);

      res.status(201).send({
        success: true,
        insertedId: result.insertedId,
        pizza: { ...newPizza, _id: result.insertedId },
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Failed to create pizza",
        error: error.message,
      });
    }
  });

  // Delete Vendor Pizza
  app.delete("/vendor/pizzas/:id", async (req, res) => {
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
      res.send({ success: result.deletedCount > 0, result });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Failed to delete pizza",
        error: error.message,
      });
    }
  });

  // Vendor Orders
  app.get("/vendor/orders", async (req, res) => {
    try {
      const filter = buildVendorFilter(req.query);
      const orders = await ordersCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(orders);
    } catch (error) {
      res.status(500).send({
        message: "Failed to fetch vendor orders",
        error: error.message,
      });
    }
  });

  // Update Order Status (e.g. accepted -> delivered)
  app.patch("/vendor/orders/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid order ID" });
      }

      const nextStatus = String(req.body?.status || "").trim().toLowerCase();
      if (!ALLOWED_ORDER_STATUSES.has(nextStatus)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid order status" });
      }

      const now = new Date();
      const updateDoc = {
        $set: {
          status: nextStatus,
          updatedAt: now,
          ...(nextStatus === "delivered" ? { deliveredAt: now } : {}),
        },
      };

      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );

      if (result.matchedCount === 0) {
        return res
          .status(404)
          .send({ success: false, message: "Order not found" });
      }

      res.send({
        success: true,
        status: nextStatus,
        message: `Order status updated to ${nextStatus}`,
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Failed to update order status",
        error: error.message,
      });
    }
  });
}