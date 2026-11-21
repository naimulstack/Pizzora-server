import { ObjectId } from "mongodb";

export default function notificationRoutes(app, db) {
  const notificationsCollection = db.collection("notifications");

  // Get Notifications (Admin / Vendor)
  app.get("/notifications", async (req, res) => {
    try {
      const { role = "", email = "" } = req.query;
      const query = {};

      if (role) query.recipientRole = role;
      if (email) query.recipientEmail = email.trim().toLowerCase();

      const notifications = await notificationsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(30)
        .toArray();

      res.send(notifications);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch notifications" });
    }
  });

  // Mark Single Notification as Read
  app.patch("/notifications/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ success: false, message: "Invalid ID" });
      }

      await notificationsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isRead: true, readAt: new Date() } }
      );

      res.send({ success: true });
    } catch (error) {
      res.status(500).send({ success: false });
    }
  });
}