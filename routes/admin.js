
import { ObjectId } from "mongodb";
import { requireAdmin } from "../middleware/authMiddleware.js";

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function adminRoutes(app, db) {
  const usersCollection = db.collection("user");
  const pizzasCollection = db.collection("pizzas");
  const ordersCollection = db.collection("orders");
  const notificationsCollection = db.collection("notifications");
  const settingsCollection = db.collection("settings");

  const admin = requireAdmin(db);

  // Admin Dashboard Stats
  app.get("/admin/stats", ...admin, async (req, res) => {
    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalPizzas,
      pendingPizzas,
      approvedPizzas,
      rejectedPizzas,
      totalOrders,
      revenue,
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

      ordersCollection.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$total", "$totalPrice"] } },
          },
        },
      ]).toArray(),

      ordersCollection.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),

      ordersCollection.aggregate([
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
      ]).toArray(),

      ordersCollection.find().sort({ createdAt: -1 }).limit(5).toArray(),

      notificationsCollection.countDocuments({
        recipientRole: "admin",
        isRead: false,
      }),
    ]);

    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const monthlySales = monthlyAgg.reverse().map((item) => ({
      month: months[item._id.month - 1],
      total: item.total,
    }));

    const orderSummary = Object.fromEntries(
      statusAgg.filter((item) => item._id).map((item) => [
        item._id,
        item.count,
      ])
    );

    return res.send({
      totalUsers,
      totalVendors,
      totalCustomers,
      totalPizzas,
      pendingPizzas,
      approvedPizzas,
      rejectedPizzas,
      totalOrders,
      totalRevenue: revenue[0]?.total || 0,
      orderSummary,
      monthlySales,
      recentOrders,
      unreadNotifications,
    });
  });

  // Get Notifications
  app.get("/admin/notifications", ...admin, async (req, res) => {
    const notifications = await notificationsCollection
      .find({ recipientRole: "admin" })
      .sort({ createdAt: -1 })
      .toArray();

    return res.send(notifications);
  });

  // Mark Notification as Read
  app.patch("/admin/notifications/:id/read", ...admin, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid ID" });
    }

    await notificationsCollection.updateOne(
      { _id: new ObjectId(id), recipientRole: "admin" },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return res.send({ success: true, message: "Notification marked as read" });
  });

  // Mark All Notifications as Read
  app.patch("/admin/notifications/read-all", ...admin, async (req, res) => {
    const result = await notificationsCollection.updateMany(
      { recipientRole: "admin", isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return res.send({
      success: true,
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  });

  // Get Pending Pizzas
  app.get("/admin/pending-pizzas", ...admin, async (req, res) => {
    const pizzas = await pizzasCollection
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .toArray();

    return res.send(pizzas);
  });

  // Approve Pizza
  app.patch("/admin/pizzas/:id/approve", ...admin, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid ID" });
    }

    const result = await pizzasCollection.updateOne(
      { _id: new ObjectId(id), status: "pending" },
      {
        $set: {
          status: "approved",
          isAvailable: true,
          rejectionReason: "",
          updatedAt: new Date(),
        },
      }
    );

    return res.send({
      success: true,
      message: "Pizza approved successfully",
      result,
    });
  });

  // Reject Pizza
  app.patch("/admin/pizzas/:id/reject", ...admin, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid ID" });
    }

    const result = await pizzasCollection.updateOne(
      { _id: new ObjectId(id), status: "pending" },
      {
        $set: {
          status: "rejected",
          rejectionReason: req.body.rejectionReason?.trim() || "",
          updatedAt: new Date(),
        },
      }
    );

    return res.send({
      success: true,
      message: "Pizza rejected successfully",
      result,
    });
  });

  // Get All Users
  app.get("/admin/users", ...admin, async (req, res) => {
    const { role, search } = req.query;
    const filter = {};

    if (role) filter.role = role;

    if (search?.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");

      filter.$or = [
        { name: regex },
        { email: regex },
      ];
    }

    const users = await usersCollection
      .find(filter, { projection: { password: 0, token: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    return res.send(users);
  });

  // Get Single User
  app.get("/admin/users/:id", ...admin, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user ID" });
    }

    const user = await usersCollection.findOne(
      { _id: new ObjectId(id) },
      { projection: { password: 0, token: 0 } }
    );

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    return res.send(user);
  });

  // Block User
  app.patch("/admin/users/:id/block", ...admin, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid ID" });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id), role: { $ne: "admin" } },
      { $set: { isBlocked: true, updatedAt: new Date() } }
    );

    return res.send({
      success: true,
      message: "User blocked successfully",
      result,
    });
  });

  // Unblock User
  app.patch("/admin/users/:id/unblock", ...admin, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid ID" });
    }

    const result = await usersCollection.updateOne(
      {
        _id: new ObjectId(id),
        isBlocked: true,
        role: { $ne: "admin" },
      },
      { $set: { isBlocked: false, updatedAt: new Date() } }
    );

    return res.send({
      success: true,
      message: "User unblocked successfully",
      result,
    });
  });

  // Update User Role
  app.patch("/admin/users/:id/role", ...admin, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user ID" });
    }

    if (!["customer", "vendor", "admin"].includes(role)) {
      return res.status(400).send({ message: "Invalid role" });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role, updatedAt: new Date() } }
    );

    if (!result.matchedCount) {
      return res.status(404).send({ message: "User not found" });
    }

    return res.send({
      success: true,
      message: `User role updated to ${role}`,
      role,
    });
  });

  // Get All Vendors
  app.get("/admin/vendors", ...admin, async (req, res) => {
    const { search = "", status = "All" } = req.query;
    const query = { role: "vendor" };

    if (status !== "All") query.status = status;

    if (search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");

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

  // Admin Settings — একটাই doc
  app.get("/admin/settings", ...admin, async (req, res) => {
    try {
      const doc = await settingsCollection.findOne({ _id: "admin" });

      res.send({
        profile: doc?.profile || {},
        marketplace: doc?.marketplace || {},
        notifications: doc?.notifications || {},
      });
    } catch (error) {
      res.status(500).send({ message: "Failed to load settings" });
    }
  });

  app.patch("/admin/settings", ...admin, async (req, res) => {
    try {
      const { profile, marketplace, notifications } = req.body || {};

      await settingsCollection.updateOne(
        { _id: "admin" },
        {
          $set: {
            ...(profile ? { profile } : {}),
            ...(marketplace ? { marketplace } : {}),
            ...(notifications ? { notifications } : {}),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      res.send({ success: true, message: "Settings saved" });
    } catch (error) {
      res.status(500).send({ message: "Failed to save settings" });
    }
  });
}
