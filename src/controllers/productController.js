const Product = require('../models/Product');
const emit = require('../sockets/emit');

exports.list = async (req, res) => {
  const { category, available } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (available !== undefined) filter.available = available === 'true';
  const products = await Product.find(filter).sort({ createdAt: -1 });
  res.json(products);
};

exports.getOne = async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
};

exports.create = async (req, res) => {
  const product = await Product.create(req.body);
  emit.catalogChanged('product', product);
  res.status(201).json(product);
};

exports.update = async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  emit.catalogChanged('product', product); // admin edit -> instantly reflected in user app catalog
  res.json(product);
};

exports.remove = async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  emit.catalogChanged('product', { _id: product._id, deleted: true });
  res.json({ ok: true });
};

exports.adjustStock = async (req, res) => {
  const { delta } = req.body; // positive to add stock, negative to reduce
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  product.stock = Math.max(0, product.stock + Number(delta));
  await product.save();
  emit.catalogChanged('product', product);
  res.json(product);
};
