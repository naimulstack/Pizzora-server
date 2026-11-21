import { ObjectId } from "mongodb";

export default function adminRoutes(app, db) {
  const usersCollection = db.collection("user");
  const pizzasCollection = db.collection("pizzas");
  const ordersCollection = db.collection("orders");
  const notificationsCollection = db.collection("notifications");

  // Admin Dashboard Statistics (All Dashboard Data)
  app.get("/admin/stats", async (req, res) => {
    try {
      const [
        totalUsers,
        totalVendors,
        totalCustomers,
        totalPizzas,
        pendingPizzas,
        approvedPizzas,
        rejectedPizzas,
        totalOrders,
        revenueResult,
        statusAgg,
        monthlyAgg,
        recentOrders,
        unreadNotifications,
      ] = await Promise.all([
        usersCollection.countDocuments(),
        usersCollection.countDocuments({ role: "vendor" }),
        usersCollection.countDocuments({ role: "customer" }),
        pizzasCollection.countDocuments(),
        pizzasCollection.countDocuments({ status: "pending" }),
        pizzasCollection.countDocuments({ status: "approved" }),
        pizzasCollection.countDocuments({ status: "rejected" }),
        ordersCollection.countDocuments(),
        ordersCollection
          .aggregate([
            {
              $group: {
                _id: null,
                total: { $sum: { $ifNull: ["$total", "$totalPrice"] } },
              },
            },
          ])
          .toArray(),
        ordersCollection
          .aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
          .toArray(),
        ordersCollection
          .aggregate([
            {
              $group: {
                _id: {
                  year: { $year: "$createdAt" },
                  month: { $month: "$createdAt" },
                },
                total: { $sum: { $ifNull: ["$total", "$totalPrice"] } },
              },
            },
            { $sort: { "_id.year": -1, "_id.month": -1 } },
            { $limit: 7 },
          ])
          .toArray(),
        ordersCollection.find().sort({ createdAt: -1 }).limit(5).toArray(),
        notificationsCollection.countDocuments({
          recipientRole: "admin",
          isRead: false,
        }),
      ]);

      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];

      const monthlySales = monthlyAgg.reverse().map((item) => ({
        month: monthNames[item._id.month - 1] || "N/A",
        total: item.total,
      }));

      const orderSummary = statusAgg.reduce((acc, item) => {
        if (item._id) acc[item._id] = item.count;
        return acc;
      }, {});

      res.send({
        totalUsers,
        totalVendors,
        totalCustomers,
        totalPizzas,
        pendingPizzas,
        approvedPizzas,
        rejectedPizzas,
        totalOrders,
        totalRevenue: revenueResult[0]?.total || 0,
        orderSummary,
        monthlySales,
        recentOrders,
        unreadNotifications,
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to load admin stats", error: error.message });
    }
  });

  // Get Pending Pizza Requests
  app.get("/admin/pending-pizzas", async (req, res) => {
    const pizzas = await pizzasCollection
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(pizzas);
  });

  // Approve Pizza
  app.patch("/admin/pizzas/:id/approve", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ success: false, message: "Invalid ID" });
    }

    const result = await pizzasCollection.updateOne(
      { _id: new ObjectId(req.params.id), status: "pending" },
      {
        $set: {
          status: "approved",
          isAvailable: true,
          rejectionReason: "",
          updatedAt: new Date(),
        },
      },
    );

    res.send({ success: true, message: "Pizza approved successfully", result });
  });

  // Reject Pizza
  app.patch("/admin/pizzas/:id/reject", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ success: false, message: "Invalid ID" });
    }

    const result = await pizzasCollection.updateOne(
      { _id: new ObjectId(req.params.id), status: "pending" },
      {
        $set: {
          status: "rejected",
          rejectionReason: req.body.rejectionReason?.trim() || "",
          updatedAt: new Date(),
        },
      },
    );

    res.send({ success: true, message: "Pizza rejected successfully", result });
  });

  // Get All Users
  app.get("/admin/users", async (req, res) => {
    const { role, search } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (search?.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { email: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const users = await usersCollection
      .find(filter, { projection: { password: 0, token: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(users);
  });

  // Get Single User
  app.get("/admin/users/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: "Invalid user ID" });
    }

    const user = await usersCollection.findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { password: 0, token: 0 } },
    );

    res.send(user);
  });

  // Block User
  app.patch("/admin/users/:id/block", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ success: false, message: "Invalid ID" });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id), role: { $ne: "admin" } },
      { $set: { isBlocked: true, updatedAt: new Date() } },
    );

    res.send({ success: true, message: "User blocked successfully", result });
  });

  // Unblock User
  app.patch("/admin/users/:id/unblock", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ success: false, message: "Invalid ID" });
    }

    const result = await usersCollection.updateOne(
      {
        _id: new ObjectId(req.params.id),
        isBlocked: true,
        role: { $ne: "admin" },
      },
      { $set: { isBlocked: false, updatedAt: new Date() } },
    );

    res.send({ success: true, message: "User unblocked successfully", result });
  });

  // Update User Role (customer | vendor | admin)
  app.patch("/admin/users/:id/role", async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!["customer", "vendor", "admin"].includes(role)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid role" });
      }

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid user ID" });
      }

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role, updatedAt: new Date() } },
      );

      if (result.matchedCount === 0) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }

      res.send({
        success: true,
        message: `User role updated to ${role}`,
        role,
        result,
      });
    } catch (error) {
      res.status(500).send({ success: false, message: error.message });
    }
  });

  // Get All Vendors
  app.get("/admin/vendors", async (req, res) => {
    const { search = "", status = "All" } = req.query;
    const query = { role: "vendor" };

    if (status && status !== "All") {
      query.status = status;
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ companyName: regex }, { name: regex }, { email: regex }];
    }

    const vendors = await usersCollection
      .find(query, { projection: { password: 0, token: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(vendors);
  });
}