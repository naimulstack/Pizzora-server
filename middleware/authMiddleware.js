import { ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

// The Express server itself hosts Better Auth at /api/auth/* (see index.js),
// so its own JWKS endpoint lives at BETTER_AUTH_URL/api/auth/jwks.
// Both client and server share the same BETTER_AUTH_SECRET, which means
// the same key pair is derived and tokens issued by the client can be
// verified against the server's own JWKS.
const SERVER_URL = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");
const CLIENT_URL = process.env.CLIENT_URL?.replace(/\/$/, "");

// Prefer the server's own JWKS (always reachable), fall back to client URL
const JWKS_BASE = SERVER_URL || CLIENT_URL;
const JWKS = JWKS_BASE
  ? createRemoteJWKSet(new URL(`${JWKS_BASE}/api/auth/jwks`))
  : null;

const requireAuth = (db) => async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token || !JWKS) {
      return res.status(401).send({
        message: "Please login first",
      });
    }

    let payload;
    try {
      // Try without issuer/audience constraints first (most compatible)
      ({ payload } = await jwtVerify(token, JWKS));
    } catch (verifyError) {
      console.error("JWT verification failed:", verifyError.message);
      return res.status(401).send({
        message: "Invalid or expired token",
      });
    }

    if (!payload.sub) {
      return res.status(401).send({
        message: "Invalid token",
      });
    }

    const userId = ObjectId.isValid(payload.sub)
      ? new ObjectId(payload.sub)
      : payload.sub;

    let user = await db.collection("user").findOne({
      _id: userId,
    });

    if (!user && userId instanceof ObjectId) {
      user = await db.collection("user").findOne({
        _id: payload.sub,
      });
    }

    if (!user) {
      return res.status(401).send({
        message: "User not found",
      });
    }

    if (user.isBlocked) {
      return res.status(403).send({
        message: "Your account has been blocked",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error("Authentication Error:", error.message);

    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
};

const requireRole = (db, allowedRole) => [
  requireAuth(db),
  (req, res, next) => {
    const role = String(req.user?.role || "")
      .trim()
      .toLowerCase();

    if (!allowedRole.includes(role)) {
      return res.status(403).send({
        message: "You do not have permission",
      });
    }

    next();
  },
];

const requireAdmin = (db) => requireRole(db, ["admin"]);

const requireVendor = (db) => requireRole(db, ["vendor"]);

const requireCustomer = (db) => requireRole(db, ["customer"]);

const requireVendorOrAdmin = (db) =>
  requireRole(db, ["vendor", "admin"]);

export {
  requireAuth,
  requireAdmin,
  requireVendor,
  requireCustomer,
  requireVendorOrAdmin,
};
