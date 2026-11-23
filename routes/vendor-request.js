
import { ObjectId } from "mongodb";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

export default function vendorRequestRoutes(app, db) {
  const requestsCollection = db.collection("vendor_requests");
  const usersCollection = db.collection("users");
  const userCollection = db.collection("user");
  const vendorsCollection = db.collection("vendors");
  const notificationsCollection = db.collection("notifications");

  const auth = requireAuth(db);
  const adminOnly = requireAdmin(db);

  app.post("/vendor-requests", auth, async (req, res) => {
    const email = String(req.user?.email || "").trim().toLowerCase();
    const shopName = String(req.body.shopName || "").trim();

    if (!email || !shopName) {
      return res.status(400).send({
        success: false,
        message: "User email and shop name are required.",
      });
    }

    const existingRequest = await requestsCollection.findOne({
      userEmail: email,
      status: { $in: ["pending", "approved"] },
    });

    if (existingRequest) {
      return res.status(409).send({
        success: false,
        message: "You already have an active vendor request.",
      });
    }

    const requestDoc = {
      userId: String(req.body.userId || "").trim(),
      userEmail: email,
      email,
      userName: String(req.body.userName || req.body.ownerName || "Customer").trim(),
      ownerName: String(req.body.ownerName || req.body.userName || "Customer").trim(),
      shopName,
      businessType: String(req.body.businessType || "").trim(),
      tradeLicenseNumber: String(req.body.tradeLicenseNumber || "").trim(),
      operatingHours: String(req.body.operatingHours || "").trim(),
      nidNumber: String(req.body.nidNumber || "").trim(),
      nidDocumentUrl: String(req.body.nidDocumentUrl || "").trim(),
      kitchenPhotoUrl: String(req.body.kitchenPhotoUrl || "").trim(),
      phone: String(req.body.phone || "").trim(),
      location: String(
        req.body.location || req.body.cityArea || req.body.fullAddress || ""
      ).trim(),
      cityArea: String(req.body.cityArea || "").trim(),
      fullAddress: String(req.body.fullAddress || "").trim(),
      vendorFee: Number.isFinite(Number(req.body.vendorFee))
        ? Number(req.body.vendorFee)
        : 3000,
      paymentStatus: req.body.paymentStatus || "paid",
      stripeSessionId: String(req.body.stripeSessionId || "").trim(),
      note: String(req.body.note || "").trim(),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await requestsCollection.insertOne(requestDoc);

    await notificationsCollection.insertOne({
      recipientRole: "admin",
      type: "vendor_request",
      title: "New Vendor Request",
      message: `${requestDoc.ownerName} requested to become a vendor (${shopName}).`,
      requestId: result.insertedId,
      vendorId: result.insertedId,
      userEmail: email,
      isRead: false,
      createdAt: new Date(),
    });

    res.status(201).send({
      success: true,
      insertedId: result.insertedId,
      request: { ...requestDoc, _id: result.insertedId },
    });
  });

  // Create Vendor Payment Checkout Session
  app.post("/vendor-requests/payment", auth, async (req, res) => {
    const requestId = String(req.body?.requestId || req.query?.requestId || "").trim();

    if (!requestId) {
      return res.status(400).send({
        success: false,
        message: "requestId is required",
      });
    }

    if (!ObjectId.isValid(requestId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid request ID",
      });
    }

    const request = await requestsCollection.findOne({
      _id: new ObjectId(requestId),
    });

    if (!request) {
      return res.status(404).send({
        success: false,
        message: "Vendor request not found",
      });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      return res.status(500).send({
        success: false,
        message: "Payment gateway is not configured",
      });
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Pizzora Vendor Registration - ${request.shopName || request.userEmail || "Vendor"}`,
              },
              unit_amount: Number(request.vendorFee) || 3000,
            },
            quantity: 1,
          },
        ],
        success_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/dashboard/vendor?checkout=success`,
        cancel_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/dashboard/vendor?checkout=cancelled`,
        metadata: { vendorRequestId: String(request._id) },
      }),
    });

    const session = await response.json();

    if (!response.ok || !session.url) {
      return res.status(500).send({
        success: false,
        message: "Failed to create checkout session",
      });
    }

    await requestsCollection.updateOne(
      { _id: request._id },
      {
        $set: {
          stripeSessionId: session.id,
          paymentStatus: "pending",
          updatedAt: new Date(),
        },
      }
    );

    return res.send({
      success: true,
      url: session.url,
    });
  });

  app.get("/vendor-requests", auth, async (req, res) => {
    const email = String(req.user?.email || "").trim().toLowerCase();
    const query = {};

    if (req.user?.role === "admin" && req.query.email) {
      query.userEmail = String(req.query.email).trim().toLowerCase();
    } else {
      query.userEmail = email;
    }

    if (req.query.status && req.query.status !== "All") {
      query.status = String(req.query.status).toLowerCase();
    }

    const requests = await requestsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(requests);
  });

  app.get("/vendor-requests/:id", auth, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid ID",
      });
    }

    const request = await requestsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!request) {
      return res.status(404).send({
        success: false,
        message: "Vendor request not found",
      });
    }

    if (req.user?.role !== "admin" && request.userEmail !== req.user?.email?.toLowerCase()) {
      return res.status(403).send({
        success: false,
        message: "Access denied",
      });
    }

    res.send(request);
  });

  app.get("/vendors", ...adminOnly, async (req, res) => {
    const vendors = await requestsCollection
      .find({ status: "approved" })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    res.send(vendors);
  });

  app.patch("/vendor-requests/:id", ...adminOnly, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid request ID",
      });
    }

    const request = await requestsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!request) {
      return res.status(404).send({
        success: false,
        message: "Vendor request not found",
      });
    }

    const status = String(req.body.status || "approved").toLowerCase() === "rejected"
      ? "rejected"
      : "approved";

    const now = new Date();

    await requestsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          ...(status === "approved" ? { approvedAt: now } : {}),
          updatedAt: now,
        },
      }
    );

    const email = String(request.userEmail || request.email || "").trim().toLowerCase();

    if (status === "approved") {
      await Promise.all([
        userCollection.updateMany(
          { email: new RegExp(`^${email}$`, "i") },
          { $set: { role: "vendor", updatedAt: now } }
        ),
        usersCollection.updateMany(
          { email: new RegExp(`^${email}$`, "i") },
          {
            $set: {
              role: "vendor",
              companyName: request.shopName || "",
              vendorName: request.shopName || "",
              updatedAt: now,
            },
          }
        ),
      ]);

      // নতুন vendor-এর ১ মাস free trial শুরু হয় (আগে থেকেই trial থাকলে বাদ)
      const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const trialFields = {
        subscriptionPlan: "free",
        subscriptionStartedAt: now,
        trialEndsAt: trialEnd,
        updatedAt: now,
      };

      await Promise.all([
        userCollection.updateMany(
          { email: new RegExp(`^${email}$`, "i"), trialEndsAt: { $exists: false } },
          { $set: trialFields }
        ),
        usersCollection.updateMany(
          { email: new RegExp(`^${email}$`, "i"), trialEndsAt: { $exists: false } },
          { $set: trialFields }
        ),
      ]);

      await vendorsCollection.updateOne(
        { email },
        {
          $set: {
            requestId: request._id,
            userId: request.userId || "",
            email,
            ownerName: request.ownerName || request.userName || "",
            shopName: request.shopName || "",
            businessType: request.businessType || "",
            phone: request.phone || "",
            location: request.location || request.cityArea || "",
            status: "active",
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
    }

    res.send({
      success: true,
      status,
      message: status === "approved"
        ? "Vendor approved and user role updated to vendor."
        : "Vendor request rejected.",
    });
  });

  // Vendor subscription/payment transactions — admin সব দেখবে
  const subscriptionPayments = db.collection("subscription_payments");

  const mapSubscriptionPayment = (doc) => ({
    _id: doc._id,
    vendorName: doc.vendorName || "",
    vendorEmail: doc.vendorEmail || "",
    plan: doc.plan || "Premium",
    amount: Number(doc.amount || 0),
    currency: doc.currency || "BDT",
    status: doc.status || "paid",
    createdAt: doc.createdAt,
  });

  app.get("/admin/transactions", ...adminOnly, async (req, res) => {
    try {
      const [requests, payments] = await Promise.all([
        requestsCollection.find({}).sort({ createdAt: -1 }).toArray(),
        subscriptionPayments.find({}).sort({ createdAt: -1 }).toArray(),
      ]);

      const transactions = [
        ...requests.map((doc) => ({
          _id: doc._id,
          vendorName: doc.shopName || doc.ownerName || "",
          vendorEmail: doc.userEmail || doc.email || "",
          plan: doc.plan || doc.subscriptionPlan || "Premium",
          amount: Number(doc.vendorFee || 0),
          currency: doc.currency || "BDT",
          status: doc.paymentStatus || "pending",
          createdAt: doc.createdAt,
        })),
        ...payments.map(mapSubscriptionPayment),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      res.send(transactions);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch transactions" });
    }
  });

  // নিজের transactions (admin হলে সব)
  app.get("/transactions", auth, async (req, res) => {
    try {
      const isAdmin =
        String(req.user?.role || "").toLowerCase() === "admin";

      const email = String(req.user?.email || "").toLowerCase();

      const [requests, payments] = await Promise.all([
        requestsCollection
          .find(isAdmin ? {} : { userEmail: email })
          .sort({ createdAt: -1 })
          .toArray(),
        subscriptionPayments
          .find(isAdmin ? {} : { vendorEmail: email })
          .sort({ createdAt: -1 })
          .toArray(),
      ]);

      const transactions = [
        ...requests.map((doc) => ({
          _id: doc._id,
          vendorName: doc.shopName || doc.ownerName || "",
          vendorEmail: doc.userEmail || doc.email || "",
          plan: doc.plan || doc.subscriptionPlan || "Premium",
          amount: Number(doc.vendorFee || 0),
          currency: doc.currency || "BDT",
          status: doc.paymentStatus || "pending",
          createdAt: doc.createdAt,
        })),
        ...payments.map(mapSubscriptionPayment),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      res.send(transactions);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch transactions" });
    }
  });
}
