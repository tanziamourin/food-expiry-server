import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
// import cookieParser from 'cookie-parser';
// import jwt from 'jsonwebtoken';


dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGO_URI;

if (!uri) throw new Error("❌ MONGO_URI is not defined in .env file");

app.use(cors());
app.use(express.json());
// app.use(cookieParser());

const client = new MongoClient(uri);
let foodCollection;

async function run() {
  try {
    await client.connect();
    const db = client.db('foodExpiryDb');
    foodCollection = db.collection('foodItems');
    console.log("✅ Connected to MongoDB");

    app.get('/', (req, res) => res.send('🍔 Food Expiry Tracker Server is Running...'));

   // Get all foods with optional search and category filter
app.get('/foods', async (req, res) => {
  try {
    const { search, category } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    if (category) {
      query.category = category;
    }

    const foods = await foodCollection.find(query).toArray();
    res.send(foods);
  } catch (error) {
    console.error('❌ Error fetching foods:', error);
    res.status(500).send({ error: 'Failed to fetch foods' });
  }
});


    // Get foods expiring within 5 days
    // app.get('/foods/expiring-soon', async (req, res) => {
    //    console.log('GET /foods/expiring-soon called');
    //   try {
    //     const start = new Date();
    //     start.setHours(0, 0, 0, 0);

    //     const end = new Date();
    //     end.setDate(end.getDate() + 5);
    //     end.setHours(23, 59, 59, 999);

    //     const expiringSoon = await foodCollection.find({
    //       expiryDate: { $gte: start, $lte: end },
    //     }).toArray();

    //     res.send(expiringSoon);
    //   } catch (error) {
    //     console.error('❌ Error fetching expiring foods:', error);
    //     res.status(500).send({ error: 'Failed to fetch expiring food items' });
    //   }
    // });

    app.get('/foods/expiring-soon',async (req, res) => {
  console.log('GET /foods/expiring-soon called');
  try {
    const end = new Date();
    end.setDate(end.getDate() + 5);
    end.setHours(23, 59, 59, 999);

    const expiringSoonOrExpired = await foodCollection.find({
      expiryDate: { $lte: end }, // all expired or expiring in next 5 days
    }).toArray();

    res.send(expiringSoonOrExpired);
  } catch (error) {
    console.error('❌ Error fetching expiring foods:', error);
    res.status(500).send({ error: 'Failed to fetch expiring food items' });
  }
});


// Get all food items for a specific user (by email)
app.get('/myfoods', async (req, res) => {
  const userEmail = req.query.email; // e.g., /myfoods?email=user@example.com

  if (!userEmail) {
    return res.status(400).send({ error: 'User email is required' });
  }

  try {
    const userFoods = await foodCollection.find({ userEmail }).toArray();
    res.send(userFoods);
  } catch (err) {
    res.status(500).send({ error: 'Failed to fetch user foods' });
  }
});

    // Get a single food item by ID
    app.get('/foods/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const foodItem = await foodCollection.findOne({ _id: new ObjectId(id) });
        if (!foodItem) {
          return res.status(404).send({ error: 'Food item not found' });
        }
        res.send(foodItem);
      } catch (error) {
        console.error('❌ Error fetching food item:', error);
        res.status(500).send({ error: 'Failed to fetch food item' });
      }
    });

 // Add new food
app.post('/foods', async (req, res) => {
  const { image, title, category, quantity, expiryDate, description, userEmail } = req.body;

  // Validate required fields
  if (!image || !title || !category || !quantity || !expiryDate || !userEmail) {
    return res.status(400).send({ error: 'Required fields are missing' });
  }

  // Validate quantity
  if (isNaN(quantity) || quantity <= 0) {
    return res.status(400).send({ error: 'Quantity must be a positive number' });
  }

  try {
    const newFood = {
      image,
      title,
      category,
      quantity: Number(quantity),
      expiryDate: new Date(expiryDate),
      description: description || "", // make description optional
      addedDate: new Date(),
      userEmail,
    };

    const result = await foodCollection.insertOne(newFood);
    res.send(result);
  } catch (error) {
    console.error('❌ Error adding new food:', error);
    res.status(500).send({ error: 'Failed to add food' });
  }
});


    // Update food item by ID
    app.put('/foods/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updatedFood = req.body;

        if (updatedFood.expiryDate) updatedFood.expiryDate = new Date(updatedFood.expiryDate);
        if (updatedFood.addedDate) updatedFood.addedDate = new Date(updatedFood.addedDate);

        const result = await foodCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedFood }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: 'Food item not found' });
        }

        res.send({ message: 'Food item updated successfully' });
      } catch (error) {
        console.error('❌ Error updating food item:', error);
        res.status(500).send({ error: 'Failed to update food item' });
      }
    });

    // Delete food item
    app.delete('/foods/:id', async (req, res) => {
      const id = req.params.id;
      const result = await foodCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Add a note to a food item
app.post('/foods/:id/notes', async (req, res) => {
  const foodId = req.params.id;
  const { text, authorEmail } = req.body;

  if (!text || !authorEmail) {
    return res.status(400).send({ error: "Text and authorEmail are required" });
  }

  try {
    const food = await foodCollection.findOne({ _id: new ObjectId(foodId) });
    if (!food) return res.status(404).send({ error: "Food not found" });

    if (food.userEmail !== authorEmail) {
      return res.status(403).send({ error: "Unauthorized to add note to this item" });
    }

    const note = {
      text,
      authorEmail,
      createdAt: new Date(),
      foodId: new ObjectId(foodId),
    };

    const result = await foodCollection.updateOne(
      { _id: new ObjectId(foodId) },
      { $push: { notes: note } }
    );

    res.send({ insertedId: foodId });
  } catch (error) {
    console.error("❌ Error adding note:", error);
    res.status(500).send({ error: "Failed to add note" });
  }
});

// Get notes for a food item
app.get('/foods/:id/notes', async (req, res) => {
  try {
    const foodId = req.params.id;
    const food = await foodCollection.findOne(
      { _id: new ObjectId(foodId) },
      { projection: { notes: 1 } }
    );

    res.send(food?.notes || []);
  } catch (error) {
    console.error("❌ Error fetching notes:", error);
    res.status(500).send({ error: "Failed to fetch notes" });
  }
});

app.post('/jwt', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ error: 'Email is required' });
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: '2h',
  });

  res
    .cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
    })
    .send({ message: 'Token set in cookie' });
});


    // Global error handler
    app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      res.status(500).send({ error: 'Something went wrong' });
    });

    app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

run().catch(console.dir);
