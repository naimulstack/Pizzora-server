import { ObjectId } from "mongodb";

const escapeRegex = (str = "") =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function vendorRequestRoutes(app, db) {
  const requestsCollection = db.collection("vendor_requests");
  const usersCollection = db.collection("users");
  const userCollection = db.collection("user");
  const vendorsCollection = db.collection("vendors");
  const notificationsCollection = db.collection("notifications");

  app.post("/vendor-requests", async (req, res) => {
    const {
      userId = "",
      userEmail = "",
      userName = "",
      ownerName = "",
      email = "",
      phone = "",
      location = "",
      cityArea = "",
      fullAddress = "",
      businessType = "",
      tradeLicenseNumber = "",
      operatingHours = "",
      nidNumber = "",
      nidDocumentUrl = "",
      kitchenPhotoUrl = "",
      vendorFee = 3000,
      paymentStatus = "paid",
      stripeSessionId = "",
      note = "",
    } = req.body;

    const normalizedEmail = (userEmail || email).trim().toLowerCase();
    const shopName = (req.body.shopName || "").trim();

    if (!normalizedEmail || !shopName) {
      return res.status(400).send({
        success: false,
        message: "User email and kitchen/shop name are required.",
      });
    }

    const existingRequest = await requestsCollection.findOne({
      userEmail: normalizedEmail,
      status: { $in: ["pending", "approved"] },
    });

    if (existingRequest) {
      return res.status(409).send({
        success: false,
        message: "You already have an active vendor request.",
      });
    }

    const requestDoc = {
      userId: String(userId).trim(),
      userEmail: normalizedEmail,
      email: normalizedEmail,
      userName: String(userName || ownerName || "Customer").trim(),
      ownerName: String(ownerName || userName || "Customer").trim(),
      shopName,
      businessType: String(businessType).trim(),
      tradeLicenseNumber: String(tradeLicenseNumber).trim(),
      operatingHours: String(operatingHours).trim(),
      nidNumber: String(nidNumber).trim(),
      nidDocumentUrl: String(nidDocumentUrl).trim(),
      kitchenPhotoUrl: String(kitchenPhotoUrl).trim(),
      phone: String(phone).trim(),
      location: String(location || cityArea || fullAddress).trim(),
      cityArea: String(cityArea).trim(),
      fullAddress: String(fullAddress).trim(),
      vendorFee: Number(vendorFee) || 3000,
      paymentStatus,
      stripeSessionId: String(stripeSessionId).trim(),
      note: String(note).trim(),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await requestsCollection.insertOne(requestDoc);

    await notificationsCollection.insertOne({
      recipientRole: "admin",
      type: "vendor_request",
      title: "New Vendor Request",
      message: `${requestDoc.ownerName} requested to become a vendor (${requestDoc.shopName}).`,
      requestId: result.insertedId,
      vendorId: result.insertedId,
      userEmail: normalizedEmail,
      isRead: false,
      createdAt: new Date(),
    });

    res.status(201).send({
      success: true,
      insertedId: result.insertedId,
      request: { ...requestDoc, _id: result.insertedId },
    });
  });

  app.get("/vendor-requests", async (req, res) => {
    const { email = "", status = "All" } = req.query;
    const query = {};

    if (email.trim()) {
      query.userEmail = email.trim().toLowerCase();
    }

    if (status && status !== "All") {
      query.status = status.toLowerCase();
    }

    const requests = await requestsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(requests);
  });

  app.get("/vendor-requests/:id", async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ success: false, message: "Invalid ID" });
    }

    const requestDoc = await requestsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!requestDoc) {
      return res
        .status(404)
        .send({ success: false, message: "Vendor request not found" });
    }

    res.send(requestDoc);
  });

  app.get("/vendors", async (req, res) => {
    const approvedRequests = await requestsCollection
      .find({ status: "approved" })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    res.send(approvedRequests);
  });

  app.patch("/vendor-requests/:id", async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid request ID" });
    }

    const requestDoc = await requestsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!requestDoc) {
      return res
        .status(404)
        .send({ success: false, message: "Vendor request not found" });
    }

    const nextStatus =
      String(req.body?.status || "approved").trim().toLowerCase() === "rejected"
        ? "rejected"
        : "approved";

    const now = new Date();

    await requestsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: nextStatus,
          ...(nextStatus === "approved" ? { approvedAt: now } : {}),
          updatedAt: now,
        },
      }
    );

    const normalizedEmail = (requestDoc.userEmail || requestDoc.email || "")
      .trim()
      .toLowerCase();

    if (nextStatus === "approved") {
      const userFilterConditions = [];

      if (normalizedEmail) {
        userFilterConditions.push({
          email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i"),
        });
      }

      if (requestDoc.userId) {
        userFilterConditions.push(
          { _id: requestDoc.userId },
          { id: requestDoc.userId }
        );
        if (ObjectId.isValid(requestDoc.userId)) {
          userFilterConditions.push({ _id: new ObjectId(requestDoc.userId) });
        }
      }

      if (userFilterConditions.length > 0) {
        await Promise.all([
          userCollection.updateMany(
            { $or: userFilterConditions },
            { $set: { role: "vendor", updatedAt: now } }
          ),
          usersCollection.updateMany(
            { $or: userFilterConditions },
            {
              $set: {
                role: "vendor",
                companyName: requestDoc.shopName || "",
                vendorName: requestDoc.shopName || "",
                updatedAt: now,
              },
            }
          ),
        ]);
      }

      if (normalizedEmail) {
        await vendorsCollection.updateOne(
          { email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i") },
          {
            $set: {
              requestId: requestDoc._id,
              userId: requestDoc.userId || "",
              email: normalizedEmail,
              ownerName: requestDoc.ownerName || requestDoc.userName || "",
              shopName: requestDoc.shopName || "",
              businessType: requestDoc.businessType || "",
              phone: requestDoc.phone || "",
              location: requestDoc.location || requestDoc.cityArea || "",
              status: "active",
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true }
        );
      }
    }

    res.send({
      success: true,
      status: nextStatus,
      message:
        nextStatus === "approved"
          ? "Vendor approved and user role updated to vendor."
          : "Vendor request rejected.",
    });
  });
}