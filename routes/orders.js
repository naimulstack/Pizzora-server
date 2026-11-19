import { ObjectId } from "mongodb";

export default function orderRoutes(app, db) {
  const ordersCollection = db.collection("orders");

  // Get All Orders
  app.get("/orders", async (req, res) => {
    try {
      const { search = "", status = "All", vendor = "", vendorEmail = "" } =
        req.query;
      const query = {};

      if (status && status !== "All") {
        query.status = status;
      }

      if (vendor.trim()) {
        query.vendor = new RegExp(vendor.trim(), "i");
      }

      if (vendorEmail.trim()) {
        query.vendorEmail = vendorEmail.trim();
      }

      if (search.trim()) {
        const regex = new RegExp(search.trim(), "i");
        query.$or = [
          { orderId: regex },
          { customerName: regex },
          { customer: regex },
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

  // Create New Order
  app.post("/orders", async (req, res) => {
    try {
      const orderData = {
        ...req.body,
        orderId:
          req.body.orderId ||
          `PZ-${Math.floor(100000 + Math.random() * 900000)}`,
        status: req.body.status || "Pending",
        vendor: req.body.vendor || "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await ordersCollection.insertOne(orderData);
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

  // Update Order Status / Assign Vendor
  app.patch("/orders/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid order ID" });
      }

      const { status, vendor, vendorEmail } = req.body;
      const updateFields = { updatedAt: new Date() };

      if (status) updateFields.status = status;
      if (vendor !== undefined) updateFields.vendor = vendor;
      if (vendorEmail !== undefined) updateFields.vendorEmail = vendorEmail;

      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        return res
          .status(404)
          .send({ success: false, message: "Order not found" });
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

      const result = await ordersCollection.deleteOne({ _id: new ObjectId(id) });
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