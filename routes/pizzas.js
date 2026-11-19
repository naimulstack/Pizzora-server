import { ObjectId } from "mongodb";

export default function pizzaRoutes(app, db) {
  const pizzasCollection = db.collection("pizzas");
  const notificationsCollection = db.collection("notifications");

  // Get Approved Pizzas
  app.get("/pizzas", async (req, res) => {
    const pizzas = await pizzasCollection
      .find({ status: "approved" })
      .toArray();
    res.send(pizzas);
  });

  // Get Single Approved Pizza
  app.get("/pizzas/:id", async (req, res) => {
    const pizza = await pizzasCollection.findOne({
      _id: new ObjectId(req.params.id),
      status: "approved",
    });
    res.send(pizza);
  });

  // Vendor Submit Pizza
  app.post("/vendor/pizzas", async (req, res) => {
    const {
      name,
      category,
      price,
      discountPrice,
      image,
      description,
      ingredients,
      sizes,
      preparationTime,
      location,
      isAvailable,
      vendorId,
      vendorEmail,
      vendorName,
      companyName,
    } = req.body;

    const pizzaData = {
      name,
      category,
      price: Number(price),
      discountPrice: discountPrice ? Number(discountPrice) : null,
      image,
      description,
      ingredients,
      sizes,
      preparationTime: Number(preparationTime),
      location,
      isAvailable: Boolean(isAvailable),
      vendorId: vendorId || null,
      vendorEmail,
      vendorName: vendorName || "",
      companyName: companyName || "",
      status: "pending",
      rejectionReason: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await pizzasCollection.insertOne(pizzaData);

    await notificationsCollection.insertOne({
      recipientRole: "admin",
      recipientId: null,
      type: "pizza_request",
      title: "New Pizza Approval Request",
      message: `${companyName || vendorName || vendorEmail} submitted a new pizza: ${name}`,
      pizzaId: result.insertedId,
      isRead: false,
      createdAt: new Date(),
    });

    res.send({
      success: true,
      message: "Pizza submitted for admin approval",
      insertedId: result.insertedId,
    });
  });
}