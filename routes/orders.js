import { ObjectId } from "mongodb";

export default function orderRoutes(app, db) {
  const ordersCollection = db.collection("orders");
  const notificationsCollection = db.collection("notifications");

  // Get All Orders
  app.get("/orders", async (req, res) => {
    try {
      const {
        search = "",
        status = "All",
        vendor = "",
        vendorEmail = "",
      } = req.query;
      const query = {};

      if (status && status !== "All") query.status = status;
      if (vendor.trim()) query.vendor = new RegExp(vendor.trim(), "i");
      if (vendorEmail.trim())
        query.vendorEmail = vendorEmail.trim().toLowerCase();

      if (search.trim()) {
        const regex = new RegExp(search.trim(), "i");
        query.$or = [
          { orderId: regex },
          { customerName: regex },
          { customerEmail: regex },
          { phone: regex },
          { vendor: regex },
        ];
      }

      const orders = await ordersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(orders);
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to fetch orders", error: error.message });
    }
  });

  // Get Single Order by Mongo _id or orderId (e.g. PZ-123456)
  app.get("/orders/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;
      let order = null;

      if (ObjectId.isValid(orderId)) {
        order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
      }

      if (!order) {
        order = await ordersCollection.findOne({ orderId });
      }

      if (!order) {
        return res.status(404).send({ message: "Order not found" });
      }

      res.send(order);
    } catch (error) {
      res
        .status(500)
        .send({
          message: "Failed to fetch order details",
          error: error.message,
        });
    }
  });

  // Create New Order (COD & Stripe)
  app.post("/orders", async (req, res) => {
    try {
      const {
        items = [],
        subtotal = 0,
        deliveryFee = 0,
        total = 0,
        phone = "",
        address = "",
        paymentMethod = "cod",
        paymentStatus = "unpaid",
        sessionId = "",
        customerEmail = "",
        customerName = "Customer",
      } = req.body;

      // Stripe page refresh korle jeno duplicate order na hoy
      if (sessionId) {
        const existing = await ordersCollection.findOne({ sessionId });
        if (existing) {
          return res.send({ success: true, order: existing, duplicate: true });
        }
      }

      const now = new Date();
      const orderId =
        req.body.orderId || `PZ-${Math.floor(100000 + Math.random() * 900000)}`;

      const orderData = {
        orderId,
        customerName,
        customerEmail: customerEmail.trim().toLowerCase(),
        phone: String(phone).trim(),
        address: String(address).trim(),
        items,
        subtotal: Number(subtotal),
        deliveryFee: Number(deliveryFee),
        total: Number(total),
        paymentMethod,
        paymentStatus,
        ...(sessionId ? { sessionId } : {}),
        status: req.body.status || "Pending Admin Review",
        vendor: req.body.vendor || "",
        vendorEmail: (req.body.vendorEmail || "").trim().toLowerCase(),
        createdAt: now,
        updatedAt: now,
      };

      const result = await ordersCollection.insertOne(orderData);

      await notificationsCollection.insertOne({
        recipientRole: "admin",
        type: "new_order",
        title: "New Order Received",
        message: `Order ${orderId} (৳${orderData.total} - ${paymentMethod.toUpperCase()}) received.`,
        orderId: result.insertedId,
        isRead: false,
        createdAt: now,
      });

      res.status(201).send({
        success: true,
        insertedId: result.insertedId,
        order: { ...orderData, _id: result.insertedId },
      });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to create order", error: error.message });
    }
  });

  // Update Order Status / Transfer to Vendor -> Notify Vendor
  app.patch("/orders/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid order ID" });
      }

      const existingOrder = await ordersCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!existingOrder) {
        return res
          .status(404)
          .send({ success: false, message: "Order not found" });
      }

      const { status, vendor, vendorEmail } = req.body;
      const now = new Date();
      const updateFields = { updatedAt: now };

      if (status) updateFields.status = status;
      if (vendor !== undefined) updateFields.vendor = String(vendor).trim();
      if (vendorEmail !== undefined) {
        updateFields.vendorEmail = String(vendorEmail).trim().toLowerCase();
      }

      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields },
      );

      const assignedEmail =
        updateFields.vendorEmail || existingOrder.vendorEmail || "";

      if (assignedEmail) {
        await notificationsCollection.insertOne({
          recipientRole: "vendor",
          recipientEmail: assignedEmail,
          type: "order_transferred",
          title: "New Order Transferred",
          message: `Order ${existingOrder.orderId || id} has been assigned to your kitchen.`,
          orderId: existingOrder._id,
          isRead: false,
          createdAt: now,
        });
      }

      res.send({ success: true, result });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to update order", error: error.message });
    }
  });

  // Delete Order
  app.delete("/orders/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid order ID" });
      }

      const result = await ordersCollection.deleteOne({
        _id: new ObjectId(id),
      });
      if (result.deletedCount === 0) {
        return res
          .status(404)
          .send({ success: false, message: "Order not found" });
      }

      res.send({ success: true, message: "Order deleted successfully" });
    } catch (error) {
      res
        .status(500)
        .send({ message: "Failed to delete order", error: error.message });
    }
  });
}
