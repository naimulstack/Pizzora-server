import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

export function requireAuth(db) {
  const usersCollection = db.collection("user");

  return async (req, res, next) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      query: { disableCookieCache: true },
    });

    if (!session) {
      return res.status(401).send({ message: "Please login first" });
    }

    const user = await usersCollection.findOne({ _id: session.user.id });

    if (!user) {
      return res.status(401).send({ message: "User not found" });
    }

    if (user.isBlocked) {
      return res.status(403).send({ message: "Your account has been blocked" });
    }

    req.user = user;
    req.session = session.session;
    next();
  };
}

export function requireAdmin(db) {
  return [
    requireAuth(db),
    (req, res, next) => {
      if (req.user.role !== "admin") {
        return res.status(403).send({ message: "Admin access only" });
      }
      next();
    },
  ];
}