const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const Transaction = require('../models/Transaction');
const Commission = require('../models/Commission');
const { debit, credit } = require('./wallet');
const { runInTransaction } = require('../utils/dbTransaction');
const { ApiError } = require('../utils/ApiError');
const { round2 } = require('../utils/money');
const NotificationEmitter = require('../utils/notificationEmitter');

const COMMISSION_LEVELS = 3;

// Reserves one unit (or just counts the sale for unlimited products); null when unavailable
const reserveStock = (productId, session) =>
  Product.findOneAndUpdate(
    { _id: productId, status: 'active', stockQuantity: { $gt: 0 } },
    { $inc: { stockQuantity: -1, sold: 1 } },
    { new: true, session }
  ).then(
    (limited) =>
      limited ||
      Product.findOneAndUpdate({ _id: productId, status: 'active', stockQuantity: -1 }, { $inc: { sold: 1 } }, { new: true, session })
  );

/**
 * Buys a product from the buyer's main wallet and pays referral commissions out of the sale price
 * to the buyer's referrers (L1..L3). Commissions only ever come from a real sale.
 */
async function purchaseProduct(buyerId, productId, io) {
  if (!mongoose.isValidObjectId(productId)) throw new ApiError(404, 'Product not found');

  if (await Purchase.exists({ user: buyerId, product: productId })) {
    throw new ApiError(409, 'You already own this product');
  }

  let result;
  try {
    result = await runInTransaction(async (session) => {
      const product = await reserveStock(productId, session);
      if (!product) throw new ApiError(404, 'Product not found or out of stock');

      const buyer = await debit(buyerId, 'main', product.price, session);

      const [tx] = await Transaction.create(
        [
          {
            user: buyerId,
            type: 'purchase',
            wallet: 'main',
            amount: product.price,
            status: 'completed',
            completedAt: new Date(),
            description: `Purchase: ${product.name}`,
            relatedProduct: product._id,
          },
        ],
        { session }
      );

      const [purchase] = await Purchase.create(
        [
          {
            user: buyerId,
            product: product._id,
            purchasePrice: product.price,
            transaction: tx._id,
            accessToken: crypto.randomBytes(24).toString('hex'),
          },
        ],
        { session }
      );

      const payouts = [];
      let referrerId = buyer.referredBy;
      for (let level = 1; level <= COMMISSION_LEVELS && referrerId; level += 1) {
        const referrer = await User.findById(referrerId).session(session);
        if (!referrer) break;
        const percentage = product.commission?.[`referralLevel${level}`] || 0;
        const amount = round2((product.price * percentage) / 100);

        if (amount > 0 && referrer.status === 'active') {
          const [ctx] = await Transaction.create(
            [
              {
                user: referrer._id,
                type: 'commission',
                wallet: 'commission',
                amount,
                status: 'completed',
                completedAt: new Date(),
                description: `L${level} commission: ${product.name}`,
                relatedProduct: product._id,
                relatedUser: buyerId,
              },
            ],
            { session }
          );
          await Commission.create(
            [{ user: referrer._id, earnedFrom: buyerId, level, amount, percentage, product: product._id, purchase: purchase._id, transaction: ctx._id }],
            { session }
          );
          const updated = await credit(referrer._id, 'commission', amount, session, { earned: true });
          payouts.push({ userId: referrer._id, level, amount, balance: updated.commissionWallet.balance });
        }
        referrerId = referrer.referredBy;
      }

      purchase.commissionPaid = round2(payouts.reduce((sum, p) => sum + p.amount, 0));
      await purchase.save({ session });

      return { product, purchase, payouts, buyerBalance: buyer.mainWallet.balance, buyerName: buyer.username };
    });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'You already own this product'); // concurrent double purchase
    throw err;
  }

  // Side effects after commit: a failed notification must not undo a paid purchase
  const notifier = new NotificationEmitter(io);
  const { product, purchase, payouts, buyerBalance, buyerName } = result;
  try {
    notifier.emitBalanceUpdate(buyerId, buyerBalance);
    await notifier.notifyUser(buyerId, {
      title: 'Purchase successful',
      message: `You bought "${product.name}" for Ksh ${product.price}.`,
      type: 'success',
      category: 'transaction',
      relatedData: { productId: product._id },
      actionUrl: '/dashboard/library',
      actionLabel: 'Open library',
    });
    for (const p of payouts) {
      io?.to(`user:${p.userId}`).emit('commission:earned', { amount: p.amount, level: p.level, timestamp: new Date() });
      await notifier.notifyUser(p.userId, {
        title: 'Commission earned',
        message: `You earned Ksh ${p.amount} (L${p.level}) from ${buyerName}'s purchase.`,
        type: 'earnings',
        category: 'commission',
        relatedData: { productId: product._id },
      });
    }
  } catch (err) {
    console.error('Post-purchase notification failed:', err.message);
  }

  return result;
}

module.exports = { purchaseProduct };
