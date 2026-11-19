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
        { vendorName: new RegExp(vendor.trim(), "i") }
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
        (order) => (order.status || "Pending") === "Pending"
      ).length;
      const totalRevenue = orders
        .filter(
          (order) =>
            order.status !== "Rejected" && order.status !== "Cancelled"
        )
        .reduce(
          (sum, order) => sum + Number(order.totalPrice ?? order.amount ?? 0),
          0
        );

      res.send({
        totalPizzas,
        totalOrders,
        pendingOrders,
        totalRevenue,
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to fetch vendor stats", error: error.message });
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
      res
        .status(500)
        .send({ message: "Failed to fetch vendor pizzas", error: error.message });
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
      res
        .status(500)
        .send({ message: "Failed to fetch vendor orders", error: error.message });
    }
  });
}