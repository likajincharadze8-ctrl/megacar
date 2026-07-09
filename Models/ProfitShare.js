const mongoose = require('mongoose');

const profitShareSchema = new mongoose.Schema(
  {
    dealerId: { type: String, required: true, trim: true },
    vin: { type: String, trim: true },
    carInfo: { type: String, trim: true }, // e.g. "Toyota Camry 2020"
    totalProfit: { type: Number, default: 0 }, // total profit from the sale
    companyPercent: { type: Number, default: 50 }, // % of profit that goes to the company
    dealerPercent: { type: Number, default: 50 },   // % of profit that goes to the dealer
    companyAmount: { type: Number, default: 0 },
    dealerAmount: { type: Number, default: 0 },
    status: { type: String, default: 'Pending' }, // 'Pending' | 'Paid'
    saleDate: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProfitShare', profitShareSchema);
