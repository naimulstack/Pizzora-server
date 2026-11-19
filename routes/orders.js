import { ObjectId } from "mongodb";

export default function orderRoutes(app, db) {
  const ordersCollection = db.collection("orders");

  // Get All Orders
  app.get("/orders", async (req, res) => {
    const { search = "", status = "All" } = req.query;
    const query = {};

    if (status && status !== "All") {
      query.status = status;
    }

    if (search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { orderId: regex },
        { customerName: regex },
        { customer: regex },
      ];
    }

    const orders = await ordersCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(orders);
  });

  // Create New Order (Customer Checkout)
  app.post("/orders", async (req, res) => {
    const orderData = {
      ...req.body,
      status: req.body.status || "Pending",
      vendor: req.body.vendor || "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await ordersCollection.insertOne(orderData);
    res.send({ success: true, insertedId: result.insertedId, order: orderData });
  });

  // Update Order Status / Assign Vendor
  app.patch("/orders/:id/status", async (req, res) => {
    const { status, vendor } = req.body;
    const updateFields = { updatedAt: new Date() };

    if (status) updateFields.status = status;
    if (vendor !== undefined) updateFields.vendor = vendor;

    const result = await ordersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateFields }
    );

    res.send({ success: true, result });
  });
}