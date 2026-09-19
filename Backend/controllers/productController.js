const mongoose = require('mongoose');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/ApiError');
const { escapeRegex, paginate } = require('../utils/helpers');
const { purchaseProduct } = require('../services/purchaseService');

const SORTS = { newest: '-createdAt', oldest: 'createdAt', price_asc: 'price', price_desc: '-price', popular: '-sold' };
const CATEGORIES = ['ebook', 'source_code', 'template', 'software', 'course', 'other'];

const productPayload = (p, owned = false) => ({
  productId: p._id,
  name: p.name,
  description: p.description,
  category: p.category,
  price: p.price,
  originalPrice: p.originalPrice,
  discount: p.discount,
  image: p.image,
  commission: p.commission,
  sold: p.sold,
  inStock: p.stockQuantity === -1 || p.stockQuantity > 0,
  owned,
  seller: p.seller?.username ? { username: p.seller.username } : undefined,
  createdAt: p.createdAt,
});

const ownedSet = async (userId, productIds) => {
  const owned = await Purchase.find({ user: userId, product: { $in: productIds } }).select('product');
  return new Set(owned.map((o) => String(o.product)));
};

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, 12);
  const filter = { status: 'active' };
  if (CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
  if (req.query.search) filter.name = new RegExp(escapeRegex(String(req.query.search)), 'i');

  const [total, products, categoryCounts] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter).sort(SORTS[req.query.sort] || SORTS.newest).skip(skip).limit(limit).populate('seller', 'username'),
    Product.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
  ]);
  const owned = await ownedSet(req.user._id, products.map((p) => p._id));

  sendSuccess(res, {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    categories: Object.fromEntries(categoryCounts.map((c) => [c._id, c.count])),
    products: products.map((p) => productPayload(p, owned.has(String(p._id)))),
  });
});

exports.getOne = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Product not found');
  const product = await Product.findOne({ _id: req.params.id, status: 'active' }).populate('seller', 'username');
  if (!product) throw new ApiError(404, 'Product not found');
  const owned = await Purchase.exists({ user: req.user._id, product: product._id });
  sendSuccess(res, productPayload(product, !!owned));
});

exports.purchase = asyncHandler(async (req, res) => {
  const { product, purchase } = await purchaseProduct(req.user._id, req.params.id, req.app.locals.io);
  sendSuccess(
    res,
    { purchaseId: purchase._id, product: product.name, amount: purchase.purchasePrice, status: purchase.status },
    'Purchase successful',
    201
  );
});

exports.myLibrary = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query, 10);
  const filter = { user: req.user._id, status: 'completed' };
  const [total, purchases, [spent = { total: 0 }]] = await Promise.all([
    Purchase.countDocuments(filter),
    Purchase.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('product', 'name category image'),
    Purchase.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$purchasePrice' } } }]),
  ]);

  sendSuccess(res, {
    owned: total,
    totalSpent: spent.total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    purchases: purchases.map((p) => ({
      purchaseId: p._id,
      productId: p.product?._id,
      product: p.product ? { name: p.product.name, category: p.product.category, image: p.product.image } : null,
      purchasePrice: p.purchasePrice,
      purchasedAt: p.createdAt,
    })),
  });
});

// The product content (download link) is only ever handed to someone who bought it
exports.access = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Product not found');
  const purchase = await Purchase.findOneAndUpdate(
    { user: req.user._id, product: req.params.id, status: 'completed' },
    { $inc: { accessCount: 1 }, lastAccessedAt: new Date() }
  );
  if (!purchase) throw new ApiError(403, 'Purchase this product to access it');
  const product = await Product.findById(req.params.id).select('name content');
  sendSuccess(res, { name: product.name, content: product.content });
});

exports.productPayload = productPayload;
exports.CATEGORIES = CATEGORIES;
