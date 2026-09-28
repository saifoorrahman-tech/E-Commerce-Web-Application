require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(express.static('public'));
const SECRET = process.env.JWT_SECRET || 'change-me';
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

// ---------- Models ----------
const User = mongoose.model('User', new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
}));
const Product = mongoose.model('Product', new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
}));
const Order = mongoose.model('Order', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [{ product: mongoose.Schema.Types.ObjectId, name: String, price: Number, qty: Number }],
  total: Number,
  address: String,
  status: { type: String, enum: STATUSES, default: 'pending' },
}, { timestamps: true }));

// ---------- Middleware ----------
const auth = (req, res, next) => {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); next(); }
  catch { res.status(401).json({ error: 'Please log in first' }); }
};
const admin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' });
const wrap = fn => (req, res) => fn(req, res).catch(e => res.status(400).json({ error: e.message }));
const session = u => ({
  token: jwt.sign({ id: u._id, role: u.role }, SECRET, { expiresIn: '7d' }),
  user: { name: u.name, email: u.email, role: u.role },
});

// ---------- Auth ----------
app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password || password.length < 6) throw new Error('Enter an email and a password of at least 6 characters');
  const u = await User.create({ name: name || email.split('@')[0], email, password: await bcrypt.hash(password, 10) });
  res.status(201).json(session(u)); // registration always creates role "user"
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const u = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.password)))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json(session(u));
}));

// ---------- Products (read: public, write: admin) ----------
app.get('/api/products', wrap(async (req, res) => res.json(await Product.find().sort('-_id'))));
app.post('/api/products', auth, admin, wrap(async (req, res) => res.status(201).json(await Product.create(req.body))));
app.put('/api/products/:id', auth, admin, wrap(async (req, res) =>
  res.json(await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }))));
app.delete('/api/products/:id', auth, admin, wrap(async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

// ---------- Orders ----------
app.post('/api/orders', auth, wrap(async (req, res) => {
  const { items, address } = req.body;
  if (!Array.isArray(items) || !items.length || !address) throw new Error('Add items and a shipping address');
  const lines = [];
  for (const { productId, qty } of items) {
    const p = await Product.findById(productId);
    if (!p || !Number.isInteger(qty) || qty < 1) throw new Error('One of the cart items is no longer available');
    if (p.stock < qty) throw new Error(`Only ${p.stock} left of ${p.name}`);
    lines.push({ p, qty });
  }
  // Prices come from the database, never from the client
  const order = await Order.create({
    user: req.user.id, address,
    items: lines.map(({ p, qty }) => ({ product: p._id, name: p.name, price: p.price, qty })),
    total: lines.reduce((sum, { p, qty }) => sum + p.price * qty, 0),
  });
  for (const { p, qty } of lines) await Product.updateOne({ _id: p._id }, { $inc: { stock: -qty } });
  res.status(201).json(order);
}));
app.get('/api/orders/mine', auth, wrap(async (req, res) =>
  res.json(await Order.find({ user: req.user.id }).sort('-_id'))));
app.get('/api/orders', auth, admin, wrap(async (req, res) =>
  res.json(await Order.find().populate('user', 'email').sort('-_id'))));
app.patch('/api/orders/:id/status', auth, admin, wrap(async (req, res) => {
  if (!STATUSES.includes(req.body.status)) throw new Error('Unknown status');
  res.json(await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }));
}));

// ---------- Start + seed ----------
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/estore').then(async () => {
  if (!(await User.exists({ role: 'admin' })))
    await User.create({ name: 'Admin', email: 'admin@store.com', password: await bcrypt.hash('admin123', 10), role: 'admin' });
  if (!(await Product.countDocuments()))
    await Product.insertMany([
      { name: 'Stoneware mug', description: 'Hand-glazed, 350 ml.', price: 18, stock: 25 },
      { name: 'Linen tote', description: 'Heavy linen with an inside pocket.', price: 32, stock: 12 },
      { name: 'Brass bookmark', description: 'Solid brass, engraved edge.', price: 9.5, stock: 40 },
    ]);
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Store running at http://localhost:${port}`));
}).catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
