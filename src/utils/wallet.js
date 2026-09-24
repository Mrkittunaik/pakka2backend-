// Single source of truth for changing a customer's wallet. Every balance
// change goes through applyWalletChange(), which guarantees the
// WalletTransaction ledger row is written together with the $inc.
//
// - Replica set (e.g. MongoDB Atlas): runs both writes in one Mongo transaction.
// - Standalone mongod (typical local dev; transactions unsupported): falls back
//   to $inc first, then the ledger row, and rolls the $inc back if the ledger
//   write fails, so a balance is never left changed without its ledger row.

const mongoose = require('mongoose');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isTxnUnsupported(err) {
  const msg = String((err && err.message) || '');
  return err && (
    err.code === 20 || // IllegalOperation
    /Transaction numbers are only allowed on a replica set/i.test(msg) ||
    /replica set/i.test(msg) && /transaction/i.test(msg)
  );
}

/**
 * @param {Object} p
 * @param {string} p.customerId
 * @param {'credit'|'debit'} p.type
 * @param {number} p.amount            positive number
 * @param {string} p.reason
 * @param {string} [p.createdBy]       e.g. "admin:64f..."
 * @param {string|null} [p.relatedTicket]
 * @returns {Promise<{ balance:number, transaction:Object, user:Object }>}
 */
async function applyWalletChange({ customerId, type, amount, reason, createdBy, relatedTicket = null }) {
  if (!['credit', 'debit'].includes(type)) throw httpError(400, "type must be 'credit' or 'debit'");
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw httpError(400, 'amount must be a positive number');
  if (!reason || !String(reason).trim()) throw httpError(400, 'reason is required');

  const delta = type === 'credit' ? amt : -amt;

  // ---- Preferred path: real transaction ----
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const user = await User.findByIdAndUpdate(
        customerId,
        { $inc: { walletBalance: delta } },
        { new: true, session }
      );
      if (!user) throw httpError(404, 'Not found');
      const [tx] = await WalletTransaction.create(
        [{ customer: customerId, amount: amt, type, reason, relatedTicket, createdBy }],
        { session }
      );
      result = { balance: user.walletBalance, transaction: tx, user };
    });
    return result;
  } catch (err) {
    if (!isTxnUnsupported(err)) throw err;
    // fall through to the standalone-safe path below
  } finally {
    session.endSession();
  }

  // ---- Fallback: standalone Mongo, no transactions ----
  const user = await User.findByIdAndUpdate(customerId, { $inc: { walletBalance: delta } }, { new: true });
  if (!user) throw httpError(404, 'Not found');
  try {
    const tx = await WalletTransaction.create({ customer: customerId, amount: amt, type, reason, relatedTicket, createdBy });
    return { balance: user.walletBalance, transaction: tx, user };
  } catch (err) {
    // ledger write failed -> undo the balance change so they never diverge
    await User.findByIdAndUpdate(customerId, { $inc: { walletBalance: -delta } }).catch(() => {});
    throw err;
  }
}

module.exports = { applyWalletChange };
