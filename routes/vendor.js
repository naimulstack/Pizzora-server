import { ObjectId } from "mongodb";

export default function vendorRoutes(app, db) {
  const pizzasCollection = db.collection("pizzas");
  const ordersCollection = db.collection("orders");

  const buildVendorFilter = ({ email = "", vendor = "" }) => {
    const conditions = [];
    if (email.trim()) {
      conditions.push({ vendorEmail: email.trim() }, { email: email.trim() });
    }
    if (vendor.trim()) {
      conditions.push(
        { vendor: new RegExp(vendor.trim(), "i") },
        { vendorName: new RegExp(vendor.trim(), "i") },
      );
    }
    return conditions.length > 0 ? { $or: conditions } : {};
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
      const totalOrders = orders.length;
      const pendingOrders = orders.filter(
        (order) => (order.status || "Pending") === "Pending",
      ).length;
      const totalRevenue = orders
        .filter(
          (order) =>
            order.status !== "Rejected" && order.status !== "Cancelled",
        )
        .reduce(
          (sum, order) => sum + Number(order.totalPrice ?? order.amount ?? 0),
          0,
        );

      res.send({
        totalPizzas,
        totalOrders,
        pendingOrders,
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
      const { email = "", vendor = "" } = req.query;
      const conditions = [];

      if (email.trim()) {
        conditions.push({ vendorEmail: email.trim() }, { email: email.trim() });
      }
      if (vendor.trim()) {
        conditions.push(
          { vendor: new RegExp(vendor.trim(), "i") },
          { vendorName: new RegExp(vendor.trim(), "i") },
        );
      }

      const filter = conditions.length > 0 ? { $or: conditions } : {};
      const pizzas = await pizzasCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(pizzas);
    } catch (error) {
      res
        .status(500)
        .send({
          message: "Failed to fetch vendor pizzas",
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

  app.delete("/vendor/pizzas/:id", async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid pizza ID" });
    }

    const result = await pizzasCollection.deleteOne({ _id: new ObjectId(id) });
    res.send({ success: result.deletedCount > 0, result });
  });

  app.post("/vendor/pizzas", async (req, res) => {
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
  });
}
