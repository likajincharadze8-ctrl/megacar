const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    dealerId: { type: String, required: true, trim: true },
    recipientFirstName: { type: String, trim: true },
    recipientLastName: { type: String, trim: true },
    recipientId: { type: String, trim: true },
    recipientPhone: { type: String, trim: true },
    recipientAddress: { type: String, trim: true },
    recipientEmail: { type: String, trim: true },
    makeModel: { type: String, trim: true },
    vin: { type: String, trim: true },
    description: { type: String, trim: true },
    totalAmount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    status: { type: String, default: 'Unpaid' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
