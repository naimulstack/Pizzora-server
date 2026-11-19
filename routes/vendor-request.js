import { ObjectId } from "mongodb";

export default function vendorRequestRoutes(app, db) {
  const requestsCollection = db.collection("vendor_requests");
  const usersCollection = db.collection("users");
  const notificationsCollection = db.collection("notifications");

  // Submit a Vendor Request (Customer -> Pending Vendor Request)
  app.post("/vendor-requests", async (req, res) => {
    try {
      const {
        userId = "",
        userEmail = "",
        userName = "",
        shopName = "",
        phone = "",
        location = "",
        note = "",
      } = req.body;

      if (!userEmail.trim() || !shopName.trim()) {
        return res.status(400).send({
          success: false,
          message: "User email and kitchen/shop name are required.",
        });
      }

      // Check if user already has a pending request
      const existingPending = await requestsCollection.findOne({
        userEmail: userEmail.trim().toLowerCase(),
        status: "pending",
      });

      if (existingPending) {
        return res.status(409).send({
          success: false,
          message: "You already have a pending vendor request.",
        });
      }

      const requestDoc = {
        userId: userId.trim(),
        userEmail: userEmail.trim().toLowerCase(),
        userName: userName.trim() || "Customer",
        shopName: shopName.trim(),
        phone: phone.trim(),
        location: location.trim(),
        note: note.trim(),
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await requestsCollection.insertOne(requestDoc);

      // Notify Admin
      await notificationsCollection.insertOne({
        recipientRole: "admin",
        type: "vendor_request",
        title: "New Vendor Request",
        message: `${requestDoc.userName} requested to become a vendor (${requestDoc.shopName}).`,
        requestId: result.insertedId,
        isRead: false,
        createdAt: new Date(),
      });

      res.status(201).send({
        success: true,
        insertedId: result.insertedId,
        request: { ...requestDoc, _id: result.insertedId },
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Failed to submit vendor request",
        error: error.message,
      });
    }
  });

  // Get All Vendor Requests (or filter by email / status)
  app.get("/vendor-requests", async (req, res) => {
    try {
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
    } catch (error) {
      res.status(500).send({
        message: "Failed to fetch vendor requests",
        error: error.message,
      });
    }
  });

  // Approve or Reject Vendor Request
  app.patch("/vendor-requests/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid request ID" });
      }

      const { action } = req.body; // "approve" | "reject"
      if (!["approve", "reject"].includes(action)) {
        return res
          .status(400)
          .send({
            success: false,
            message: "Action must be approve or reject",
          });
      }

      const requestDoc = await requestsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!requestDoc) {
        return res
          .status(404)
          .send({ success: false, message: "Vendor request not found" });
      }

      const nextStatus = action === "approve" ? "approved" : "rejected";

      await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: nextStatus, updatedAt: new Date() } },
      );

      // Upgrade user role to "vendor" when approved
      if (action === "approve" && requestDoc.userEmail) {
        const userFilter = {
          email: new RegExp(`^${requestDoc.userEmail}$`, "i"),
        };

        await usersCollection.updateOne(userFilter, {
          $set: {
            role: "vendor",
            companyName: requestDoc.shopName,
            vendorName: requestDoc.shopName,
            updatedAt: new Date(),
          },
        });
      }

      res.send({
        success: true,
        status: nextStatus,
        message:
          action === "approve"
            ? "Vendor request approved and user role updated to vendor."
            : "Vendor request rejected.",
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Failed to update vendor request",
        error: error.message,
      });
    }
  });

  app.patch("/vendor-requests/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid request ID" });
      }

      const { action } = req.body; // "approve" | "reject"
      const requestDoc = await requestsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!requestDoc) {
        return res
          .status(404)
          .send({ success: false, message: "Vendor request not found" });
      }

      const nextStatus = action === "approve" ? "approved" : "rejected";

      await requestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: nextStatus, updatedAt: new Date() } },
      );

      // ঠিক এখানেই ইউজারের role -> "vendor" আপডেট হবে
      if (action === "approve") {
        const roleUpdate = {
          $set: {
            role: "vendor",
            companyName: requestDoc.shopName || "",
            vendorName: requestDoc.shopName || "",
            updatedAt: new Date(),
          },
        };

        const filterConditions = [];
        if (requestDoc.userId && ObjectId.isValid(requestDoc.userId)) {
          filterConditions.push({ _id: new ObjectId(requestDoc.userId) });
          filterConditions.push({ id: requestDoc.userId });
        }
        if (requestDoc.userEmail) {
          filterConditions.push({
            email: new RegExp(`^${requestDoc.userEmail.trim()}$`, "i"),
          });
        }

        if (filterConditions.length > 0) {
          const userFilter = { $or: filterConditions };
          await Promise.all([
            db.collection("users").updateOne(userFilter, roleUpdate),
            db.collection("user").updateOne(userFilter, roleUpdate),
          ]);
        }
      }

      res.send({
        success: true,
        status: nextStatus,
        message:
          action === "approve"
            ? "Vendor approved and user role updated."
            : "Vendor request rejected.",
      });
    } catch (error) {
      res.status(500).send({ success: false, message: error.message });
    }
  });
}
