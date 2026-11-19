import { ObjectId } from "mongodb";
import { requireAdmin } from "../middleware/authMiddleware.js";

export default function adminRoutes(app, db) {
  const usersCollection = db.collection("user");
  const pizzasCollection = db.collection("pizzas");
  const notificationsCollection = db.collection("notifications");
  const adminOnly = requireAdmin(db);

  // Admin Dashboard Statistics
  app.get("/admin/stats", ...adminOnly, async (req, res) => {
    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalPizzas,
      pendingPizzas,
      approvedPizzas,
      rejectedPizzas,
      unreadNotifications,
    ] = await Promise.all([
      usersCollection.countDocuments(),
      usersCollection.countDocuments({ role: "vendor" }),
      usersCollection.countDocuments({ role: "customer" }),
      pizzasCollection.countDocuments(),
      pizzasCollection.countDocuments({ status: "pending" }),
      pizzasCollection.countDocuments({ status: "approved" }),
      pizzasCollection.countDocuments({ status: "rejected" }),
      notificationsCollection.countDocuments({
        recipientRole: "admin",
        isRead: false,
      }),
    ]);

    res.send({
      totalUsers,
      totalVendors,
      totalCustomers,
      totalPizzas,
      pendingPizzas,
      approvedPizzas,
      rejectedPizzas,
      unreadNotifications,
    });
  });

  // Get Pending Pizza Requests
  app.get("/admin/pending-pizzas", ...adminOnly, async (req, res) => {
    const pizzas = await pizzasCollection
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(pizzas);
  });

  // Approve Pizza
  app.patch("/admin/pizzas/:id/approve", ...adminOnly, async (req, res) => {
    const result = await pizzasCollection.updateOne(
      { _id: new ObjectId(req.params.id), status: "pending" },
      {
        $set: {
          status: "approved",
          rejectionReason: "",
          updatedAt: new Date(),
        },
      }
    );

    res.send({ success: true, message: "Pizza approved successfully", result });
  });

  // Reject Pizza
  app.patch("/admin/pizzas/:id/reject", ...adminOnly, async (req, res) => {
    const result = await pizzasCollection.updateOne(
      { _id: new ObjectId(req.params.id), status: "pending" },
      {
        $set: {
          status: "rejected",
          rejectionReason: req.body.rejectionReason?.trim() || "",
          updatedAt: new Date(),
        },
      }
    );

    res.send({ success: true, message: "Pizza rejected successfully", result });
  });

  // Get Admin Notifications
  app.get("/admin/notifications", ...adminOnly, async (req, res) => {
    const notifications = await notificationsCollection
      .find({ recipientRole: "admin" })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(notifications);
  });

  // Mark Single Notification as Read
  app.patch("/admin/notifications/:id/read", ...adminOnly, async (req, res) => {
    const result = await notificationsCollection.updateOne(
      { _id: new ObjectId(req.params.id), recipientRole: "admin" },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.send({ success: true, message: "Notification marked as read", result });
  });

  // Mark All Notifications as Read
  app.patch("/admin/notifications/read-all", ...adminOnly, async (req, res) => {
    const result = await notificationsCollection.updateMany(
      { recipientRole: "admin", isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.send({
      success: true,
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  });

  // Get All Users
  app.get("/admin/users", ...adminOnly, async (req, res) => {
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
  app.get("/admin/users/:id", ...adminOnly, async (req, res) => {
    const user = await usersCollection.findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { password: 0, token: 0 } }
    );

    res.send(user);
  });

  // Block User
  app.patch("/admin/users/:id/block", ...adminOnly, async (req, res) => {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id), role: { $ne: "admin" } },
      { $set: { isBlocked: true, updatedAt: new Date() } }
    );

    res.send({ success: true, message: "User blocked successfully", result });
  });

  // Unblock User
  app.patch("/admin/users/:id/unblock", ...adminOnly, async (req, res) => {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id), isBlocked: true },
      { $set: { isBlocked: false, updatedAt: new Date() } }
    );

    res.send({ success: true, message: "User unblocked successfully", result });
  });
}