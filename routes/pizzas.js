import { ObjectId } from "mongodb";

const escapeRegex = (str = "") =>
  String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function pizzaRoutes(app, db) {
  const pizzasCollection = db.collection("pizzas");
  const notificationsCollection = db.collection("notifications");

  app.get("/pizzas", async (req, res) => {
    const pizzas = await pizzasCollection
      .find({ status: "approved" })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(pizzas);
  });

  app.get("/pizzas/:id", async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: "Invalid pizza ID" });
    }

    const pizza = await pizzasCollection.findOne({
      _id: new ObjectId(req.params.id),
      status: "approved",
    });
    res.send(pizza);
  });

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
      email,
      vendorName,
      companyName,
    } = req.body;

    const resolvedEmail = String(vendorEmail || email || "")
      .trim()
      .toLowerCase();

    if (!resolvedEmail) {
      return res.status(400).send({
        success: false,
        message: "Vendor email is required to submit a pizza.",
      });
    }

    const pizzaData = {
      name: String(name || "").trim(),
      category: String(category || "").trim(),
      price: Number(price) || 0,
      discountPrice: discountPrice ? Number(discountPrice) : null,
      image: image || "",
      description: description || "",
      ingredients: ingredients || "",
      sizes: sizes || [],
      preparationTime: Number(preparationTime) || 20,
      location: location || "",
      isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true,
      vendorId: vendorId || null,
      vendorEmail: resolvedEmail,
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
      message: `${
        companyName || vendorName || resolvedEmail
      } submitted a new pizza: ${pizzaData.name}`,
      pizzaId: result.insertedId,
      isRead: false,
      createdAt: new Date(),
    });

    res.status(201).send({
      success: true,
      message: "Pizza submitted for admin approval",
      insertedId: result.insertedId,
      pizza: { ...pizzaData, _id: result.insertedId },
    });
  });

  app.get("/vendor/pizzas", async (req, res) => {
    const emailParam = String(req.query.email || "").trim().toLowerCase();
    const vendorParam = String(req.query.vendor || "").trim();

    const filter = {};
    if (emailParam) {
      const regex = new RegExp(`^${escapeRegex(emailParam)}$`, "i");
      filter.$or = [{ vendorEmail: regex }, { email: regex }];
    } else if (vendorParam) {
      filter.vendorName = new RegExp(`^${escapeRegex(vendorParam)}$`, "i");
    }

    const pizzas = await pizzasCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(pizzas);
  });
}