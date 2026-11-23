import { ObjectId } from "mongodb";
import {
  requireAuth,
  requireCustomer,
} from "../middleware/authMiddleware.js";

export default function orderRoutes(app, db) {
  const ordersCollection = db.collection("orders");
  const pizzasCollection = db.collection("pizzas");
  const notificationsCollection = db.collection("notifications");

  const auth = requireAuth(db);
  const customer = requireCustomer(db);

  const escapeRegex = (value = "") =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Get All Orders
  app.get("/orders", auth, async (req, res) => {
    try {
      const {
        search = "",
        status = "All",
        vendor = "",
        vendorEmail = "",
      } = req.query;

      const role = String(req.user.role || "").toLowerCase();
      const query = {};

      if (role === "vendor") {
        query.$or = [
          { vendorEmail: req.user.email },
          { "items.vendorEmail": req.user.email },
        ];
      } else if (role === "customer") {
        query.customerEmail = req.user.email;
      }

      if (status !== "All") query.status = status;

      if (vendor) {
        query.vendor = {
          $regex: escapeRegex(vendor),
          $options: "i",
        };
      }

      if (vendorEmail && role === "admin") {
        query.vendorEmail = vendorEmail.toLowerCase();
      }

      if (search) {
        const regex = new RegExp(escapeRegex(search), "i");

        query.$and = [
          {
            $or: [
              { orderId: regex },
              { customerName: regex },
              { customerEmail: regex },
              { phone: regex },
              { vendor: regex },
            ],
          },
        ];
      }

      const orders = await ordersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(orders);
    } catch (error) {
      res.status(500).send({
        message: "Failed to fetch orders",
      });
    }
  });

  // Get Single Order
  app.get("/orders/:orderId", auth, async (req, res) => {
    try {
      const { orderId } = req.params;

      const order = await ordersCollection.findOne({
        $or: [
          ...(ObjectId.isValid(orderId)
            ? [{ _id: new ObjectId(orderId) }]
            : []),
          { orderId },
        ],
      });

      if (!order) {
        return res.status(404).send({
          message: "Order not found",
        });
      }

      const role = String(req.user.role || "").toLowerCase();

      const isAdmin = role === "admin";
      const isCustomer = order.customerEmail === req.user.email;
      const isVendor =
        order.vendorEmail === req.user.email ||
        order.items?.some(
          (item) => item.vendorEmail === req.user.email
        );

      if (!isAdmin && !isCustomer && !isVendor) {
        return res.status(403).send({
          message: "Access denied",
        });
      }

      res.send(order);
    } catch (error) {
      res.status(500).send({
        message: "Failed to fetch order",
      });
    }
  });

  // Create New Order
  app.post("/orders", customer, async (req, res) => {
    try {
      const {
        items = [],
        phone = "",
        address = "",
        deliveryDate = "",
        paymentMethod = "cod",
      } = req.body;

      if (!Array.isArray(items) || !items.length) {
        return res.status(400).send({
          message: "Please add at least one pizza",
        });
      }

      if (!phone.trim() || !address.trim()) {
        return res.status(400).send({
          message: "Phone and address are required",
        });
      }

      const pizzaItems = [];

      for (const item of items) {
        const pizzaId = item.pizzaId || item._id || item.id;
        // কার্ট item-এ `qty` আছে, পুরোনো data-তে `quantity` — দুটোই চলবে
        const quantity = Number(item.quantity ?? item.qty);

        if (!ObjectId.isValid(String(pizzaId)) || !Number.isInteger(quantity) || quantity < 1) {
          return res.status(400).send({
            message: "Invalid order item",
          });
        }

        const pizza = await pizzasCollection.findOne({
          _id: new ObjectId(String(pizzaId)),
          status: "approved",
        });

        if (!pizza || pizza.isAvailable === false) {
          return res.status(400).send({
            message: "One or more pizzas are unavailable",
          });
        }

        const price = Number(pizza.discountPrice || pizza.price);

        if (!Number.isFinite(price) || price <= 0) {
          return res.status(400).send({
            message: "Invalid pizza price",
          });
        }

        pizzaItems.push({
          pizzaId: pizza._id,
          name: pizza.name,
          image: pizza.image,
          price,
          quantity,
          vendor: pizza.vendor || "",
          vendorEmail: pizza.vendorEmail || "",
        });
      }

      const subtotal = pizzaItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const deliveryFee = 60;
      const total = subtotal + deliveryFee;

      const now = new Date();
      const orderId = `PZ-${Date.now()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

      const orderData = {
        orderId,
        customerName: req.user.name || "Customer",
        customerEmail: req.user.email,
        phone: phone.trim(),
        address: address.trim(),
        deliveryDate: String(deliveryDate).trim(),
        items: pizzaItems,
        subtotal,
        deliveryFee,
        total,
        paymentMethod,
        paymentStatus: "unpaid",
        status: "Pending Admin Review",
        vendor: "",
        vendorEmail: "",
        createdAt: now,
        updatedAt: now,
      };

      const result = await ordersCollection.insertOne(orderData);

      await notificationsCollection.insertOne({
        recipientRole: "admin",
        type: "new_order",
        title: "New Order Received",
        message: `Order ${orderId} (৳${total}) received.`,
        orderId: result.insertedId,
        isRead: false,
        createdAt: now,
      });

      res.status(201).send({
        success: true,
        insertedId: result.insertedId,
        order: {
          ...orderData,
          _id: result.insertedId,
        },
      });
    } catch (error) {
      console.error("Create Order Error:", error.message);

      res.status(500).send({
        message: "Failed to create order",
      });
    }
  });

  // Update Order Status (Admin)
  app.patch("/orders/:id/status", ...admin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, vendor, vendorEmail } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid order ID",
        });
      }

      const allowedStatuses = [
        "Pending Admin Review",
        "Accepted",
        "Processing",
        "Preparing",
        "On the Way",
        "Delivered",
        "Rejected",
        "Cancelled",
      ];

      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).send({
          message: "Invalid order status",
        });
      }

      const order = await ordersCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!order) {
        return res.status(404).send({
          message: "Order not found",
        });
      }

      const updateFields = {
        updatedAt: new Date(),
        ...(status ? { status } : {}),
        ...(vendor !== undefined
          ? { vendor: String(vendor).trim() }
          : {}),
        ...(vendorEmail !== undefined
          ? { vendorEmail: String(vendorEmail).trim().toLowerCase() }
          : {}),
      };

      await ordersCollection.updateOne(
        { _id: order._id },
        { $set: updateFields }
      );

      const assignedEmail =
        updateFields.vendorEmail || order.vendorEmail;

      if (assignedEmail) {
        await notificationsCollection.insertOne({
          recipientRole: "vendor",
          recipientEmail: assignedEmail,
          type: "order_transferred",
          title: "New Order Transferred",
          message: `Order ${order.orderId} has been assigned to your kitchen.`,
          orderId: order._id,
          isRead: false,
          createdAt: new Date(),
        });
      }

      res.send({
        success: true,
        message: "Order updated successfully",
      });
    } catch (error) {
      res.status(500).send({
        message: "Failed to update order",
      });
    }
  });

  // Delete Order (Admin)
  app.delete("/orders/:id", ...admin, async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid order ID",
        });
      }

      const result = await ordersCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (!result.deletedCount) {
        return res.status(404).send({
          message: "Order not found",
        });
      }

      res.send({
        success: true,
        message: "Order deleted successfully",
      });
    } catch (error) {
      res.status(500).send({
        message: "Failed to delete order",
      });
    }
  });

  // Customer নিজের order cancel — শুধু নিজের order
  app.patch("/orders/:orderId/cancel", auth, async (req, res) => {
    try {
      const { orderId } = req.params;

      const query = ObjectId.isValid(orderId)
        ? { $or: [{ _id: new ObjectId(orderId) }, { orderId }] }
        : { orderId };

      const order = await ordersCollection.findOne(query);

      if (!order) {
        return res.status(404).send({ message: "Order not found" });
      }

      const isAdmin =
        String(req.user?.role || "").toLowerCase() === "admin";
      const isOwner = order.customerEmail === req.user?.email;

      if (!isAdmin && !isOwner) {
        return res.status(403).send({ message: "Access denied" });
      }

      const cancellable = ["pending", "pending admin review", "accepted"];

      if (
        !cancellable.includes(
          String(order.status || "").trim().toLowerCase()
        )
      ) {
        return res.status(400).send({
          message: "This order can no longer be cancelled",
        });
      }

      const now = new Date();

      await ordersCollection.updateOne(
        { _id: order._id },
        { $set: { status: "Cancelled", updatedAt: now } }
      );

      res.send({ success: true, message: "Order cancelled" });
    } catch (error) {
      res.status(500).send({ message: "Failed to cancel order" });
    }
  });
}