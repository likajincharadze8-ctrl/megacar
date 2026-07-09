const mongoose = require('mongoose');

const financingSchema = new mongoose.Schema(
  {
    dealerId: { type: String, required: true, trim: true },
    vin: { type: String, trim: true },
    carInfo: { type: String, trim: true }, // e.g. "Hyundai Kona 2019"
    financedAmount: { type: Number, default: 0 }, // principal given to dealer
    amountRepaid: { type: Number, default: 0 },   // principal paid back so far
    fixedFee: { type: Number, default: 200 },      // flat company fee per financed car
    feePaid: { type: Boolean, default: false },
    financedDate: { type: String, trim: true },
    status: { type: String, default: 'Active' }, // 'Active' | 'Paid Off'
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Financing', financingSchema);
