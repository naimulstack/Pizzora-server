
export default function userRoutes(app, db) {
  const usersCollection = db.collection("user");

  // Get All Users
  // http://localhost:5000/users
  app.get("/users", async (req, res) => {
    try {
      const users = await usersCollection
        .find({}, {
          projection: {
            password: 0,
          },
        })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(users);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch users" });
    }
  });
}
