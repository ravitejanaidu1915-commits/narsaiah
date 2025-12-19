// backend/server.js
require("dotenv").config(); // Load environment variables from .env

const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const Twilio = require("twilio");
const multer = require("multer"); // For file uploads

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// --------------------- Twilio Setup ----------------------
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE;
const adminPhone = process.env.ADMIN_PHONE;
const client = new Twilio(accountSid, authToken);

// --------------------- File Paths ----------------------
const PRODUCTS_FILE = path.join(__dirname, "products.json");
const ORDERS_FILE = path.join(__dirname, "orders.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");

// --------------------- Initialize files ----------------------
if (!fs.existsSync(PRODUCTS_FILE))
  fs.writeFileSync(
    PRODUCTS_FILE,
    JSON.stringify(
      [
        { name: "Fresh Cow Milk", price: 80, unit: "1L", image: "" },
        { name: "Fresh Curd", price: 50, unit: "1kg", image: "" },
        { name: "Soft Milk 500ml", price: 40, unit: "500ml", image: "" },
      ],
      null,
      2
    )
  );

if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, JSON.stringify([]));
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// --------------------- Helper functions ----------------------
function loadProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
}

function saveProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

function loadOrders() {
  return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8"));
}

function saveOrder(order) {
  const orders = loadOrders();
  orders.push(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// --------------------- Multer setup for image upload ----------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Serve uploaded images
app.use("/uploads", express.static(UPLOADS_DIR));

// --------------------- API Routes ----------------------

// Get products
app.get("/api/products", (req, res) => {
  res.json(loadProducts());
});

// Admin uploads image + adds product (NEW ROUTE)
app.post("/api/add-product", upload.single("image"), (req, res) => {
  const products = loadProducts();
  const { name, price, unit } = req.body;

  const newProduct = {
    name,
    price: Number(price),
    unit,
    image: req.file ? `/uploads/${req.file.filename}` : "",
  };

  products.push(newProduct);
  saveProducts(products);

  res.json({ message: "✅ Product added successfully!", product: newProduct });
});

// Admin updates full product list (edit/delete)
app.post("/api/products", (req, res) => {
  const products = req.body.products;
  saveProducts(products);
  res.json({ message: "✅ Products saved successfully!" });
});

// Get all orders (Admin)
app.get("/api/orders", (req, res) => {
  res.json(loadOrders());
});

// Customer places order
app.post("/api/order", async (req, res) => {
  const { name, phone, items, latitude, longitude } = req.body;

  // Calculate total
  const products = loadProducts();
  let total = 0;
  items.forEach((i) => {
    const product = products.find((p) => p.name === i.name);
    if (product) total += product.price * i.qty;
  });

  const order = {
    name,
    phone,
    items,
    total,
    location: `${latitude}, ${longitude}`,
    date: new Date().toLocaleString(),
  };

  saveOrder(order);

  // Send SMS to admin
  const itemsText = items.map((i) => `${i.name}: ${i.qty}`).join(", ");
  const messageBody = `📦 New Order from ${name}\nPhone: ${phone}\nItems: ${itemsText}\nTotal: ₹${total}\nLocation: ${order.location}`;

  try {
    await client.messages.create({
      body: messageBody,
      from: twilioPhone,
      to: adminPhone,
    });
    res.json({ message: "✅ Order placed successfully! SMS sent to admin." });
  } catch (err) {
    console.error("SMS sending failed:", err.message);
    res.json({ message: "✅ Order placed but SMS failed." });
  }
});

// --------------------- Serve Pages ----------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------------------- Start Server ----------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
