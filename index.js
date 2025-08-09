import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { verifyJWT } from "./verifyJWT.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGO_URI;

app.use(
  cors({
    origin: "http://localhost:5173", // client side url
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const client = new MongoClient(uri);
let foodCollection;

async function run() {
  try {
    await client.connect();
    const db = client.db("foodExpiryDb");
    foodCollection = db.collection("foodItems");
    console.log("Connected to MongoDB");

    app.get("/", (req, res) =>
      res.send("Food Expiry Tracker Server is Running...")
    );

    // jwt code start

    app.post("/jwt", (req, res) => {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });
      if (!process.env.JWT_SECRET)
        return res.status(500).json({ error: "Server config error" });

      const token = jwt.sign({ email }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        secure: true,
  sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.json({ success: true, message: "JWT token set in cookie" });
    });

    // get foods from font end

    app.get("/foods", async (req, res) => {
      try {
        const { search, category } = req.query;
        const query = {};
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } },
          ];
        }
        if (category) query.category = category;
        const foods = await foodCollection.find(query).toArray();
        res.send(foods);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch foods" });
      }
    });

    // expiring foods

    app.get("/foods/expiring-soon", async (req, res) => {
      try {
        const end = new Date();
        end.setDate(end.getDate() + 5);
        end.setHours(23, 59, 59, 999);

        const foods = await foodCollection
          .find({ expiryDate: { $lte: end } })
          .toArray();
        res.send(foods);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch expiring foods" });
      }
    });

    // my foods

    app.get("/myfoods", verifyJWT, async (req, res) => {
      const userEmail = req.query.email;
      if (!userEmail)
        return res.status(400).send({ error: "User email is required" });

      try {
        const foods = await foodCollection.find({ userEmail }).toArray();
        res.send(foods);
      } catch {
        res.status(500).send({ error: "Failed to fetch user foods" });
      }
    });

    // foods geting by id

    app.get("/foods/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const foodItem = await foodCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!foodItem)
          return res.status(404).send({ error: "Food item not found" });
        res.send(foodItem);
      } catch {
        res.status(500).send({ error: "Failed to fetch food item" });
      }
    });

    app.post("/foods", verifyJWT, async (req, res) => {
       console.log("Body received:", req.body); 
      const {
        image,
        title,
        category,
        quantity,
        expiryDate,
        description,
        userEmail,
      } = req.body;
      if (
        !image ||
        !title ||
        !category ||
        !quantity ||
        !expiryDate ||
        !userEmail
      ) {
        return res.status(400).send({ error: "Required fields are missing" });
      }
      if (isNaN(quantity) || quantity <= 0) {
        return res
          .status(400)
          .send({ error: "Quantity must be a positive number" });
      }
      try {
        const newFood = {
          image,
          title,
          category,
          quantity: Number(quantity),
          expiryDate: new Date(expiryDate),
          description: description || "",
          addedDate: new Date(),
          userEmail,
        };
        const result = await foodCollection.insertOne(newFood);
        res.send(result);
      } catch {
        res.status(500).send({ error: "Failed to add food" });
      }
    });

    app.put("/foods/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedFood = req.body;

        if (updatedFood.expiryDate)
          updatedFood.expiryDate = new Date(updatedFood.expiryDate);
        if (updatedFood.addedDate)
          updatedFood.addedDate = new Date(updatedFood.addedDate);

        const result = await foodCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedFood }
        );
        if (result.matchedCount === 0)
          return res.status(404).send({ error: "Food item not found" });

        res.send({ message: "Food item updated successfully" });
      } catch {
        res.status(500).send({ error: "Failed to update food item" });
      }
    });

    app.delete("/foods/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await foodCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch {
        res.status(500).send({ error: "Failed to delete food item" });
      }
    });

    app.post("/foods/:id/notes", async (req, res) => {
      const foodId = req.params.id;
      const { text, authorEmail } = req.body;
      if (!text || !authorEmail)
        return res
          .status(400)
          .send({ error: "Text and authorEmail are required" });

      try {
        const food = await foodCollection.findOne({
          _id: new ObjectId(foodId),
        });
        if (!food) return res.status(404).send({ error: "Food not found" });

        if (food.userEmail !== authorEmail) {
          return res.status(403).send({ error: "Unauthorized to add note" });
        }

        const note = {
          text,
          authorEmail,
          createdAt: new Date(),
          foodId: new ObjectId(foodId),
        };

        await foodCollection.updateOne(
          { _id: new ObjectId(foodId) },
          { $push: { notes: note } }
        );
        res.send({ insertedId: foodId });
      } catch {
        res.status(500).send({ error: "Failed to add note" });
      }
    });

    app.get("/foods/:id/notes", async (req, res) => {
      try {
        const foodId = req.params.id;
        const food = await foodCollection.findOne(
          { _id: new ObjectId(foodId) },
          { projection: { notes: 1 } }
        );
        res.send(food?.notes || []);
      } catch {
        res.status(500).send({ error: "Failed to fetch notes" });
      }
    });


    // Dummy awareness stats (could come from DB)
const awarenessStats = {
  totalFoodSaved: 120, // in kg
  mealsProvided: 300,
  carbonFootprintReduced: 450, // in kg CO2
};

// Dummy awareness tips
const awarenessTips = [
  "Plan your meals before shopping to avoid waste.",
  "Store food properly to extend freshness.",
  "Use leftovers creatively for new meals.",
  "Check expiry dates regularly.",
];

// Dummy recipe suggestions
const recipeSuggestions = [
  {
    id: 1,
    title: "Veggie Stir Fry",
    ingredients: ["carrots", "broccoli", "soy sauce"],
    steps: ["Chop veggies", "Stir fry with sauce", "Serve hot"],
  },
  {
    id: 2,
    title: "Banana Pancakes",
    ingredients: ["ripe bananas", "flour", "milk", "eggs"],
    steps: ["Mash bananas", "Mix with other ingredients", "Cook on pan"],
  },
];

// Route: Awareness stats
app.get("/awareness-stats", (req, res) => {
  res.json(awarenessStats);
});

// Route: Awareness tips
app.get("/awareness-tips", (req, res) => {
  res.json(awarenessTips);
});

// Route: Recipe suggestions
app.get("/recipes/suggestions", (req, res) => {
  res.json(recipeSuggestions);
});

    // Global error handler
    app.use((err, req, res, next) => {
      console.error("Unhandled error:", err);
      res.status(500).send({ error: "Something went wrong" });
    });

    app.listen(port, () =>
      console.log(` Server running on http://localhost:${port}`)
    );
  } catch (err) {
    console.error("Error:", err);
  }
}

run().catch(console.dir);
