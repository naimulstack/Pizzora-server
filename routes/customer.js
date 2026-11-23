import { requireAuth } from "../middleware/authMiddleware.js";

const ACTIVE_ORDER_STATUSES = new Set([
  "pending",
  "accepted",
  "approved",
  "preparing",
  "processing",
  "on the way",
]);

const DELIVERED_ORDER_STATUSES = new Set(["delivered", "completed"]);

export default function customerRoutes(app, db) {
  const ordersCollection = db.collection("orders");
  const auth = requireAuth(db);

  app.get("/customer/orders", auth, async (req, res) => {
    const email = String(req.user?.email || "").trim().toLowerCase();

    const orders = await ordersCollection
      .find({ customerEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    const totalOrders = orders.length;
    const deliveredOrders = orders.filter((order) =>
      DELIVERED_ORDER_STATUSES.has(
        String(order.status || "").trim().toLowerCase()
      )
    );

    const activeOrders = orders.filter((order) =>
      ACTIVE_ORDER_STATUSES.has(
        String(order.status || "pending").trim().toLowerCase()
      )
    ).length;

    const totalSpent = deliveredOrders.reduce(
      (sum, order) =>
        sum + Number(
          order.subtotal ||
          order.total ||
          order.totalPrice ||
          order.totalAmount ||
          order.amount ||
          0
        ),
      0
    );

    res.send({
      orders,
      stats: {
        totalOrders,
        deliveredOrders: deliveredOrders.length,
        activeOrders,
        totalSpent,
      },
    });
  });
}
