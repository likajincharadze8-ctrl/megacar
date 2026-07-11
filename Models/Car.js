const mongoose = require('mongoose');

const carSchema = new mongoose.Schema(
  {
    makeModel: { type: String, required: true, trim: true },
    auctionPrice: { type: Number, default: 0 },
    transportPrice: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    vin: { type: String, trim: true },
    lotNumber: { type: String, trim: true },
    dealerId: { type: String, trim: true },
    purchaseDate: { type: String, trim: true },
    auctionName: { type: String, trim: true },
    buyLocation: { type: String, trim: true },
    containerNumber: { type: String, trim: true },
    containerCode: { type: String, trim: true },
    recipientFirstName: { type: String, trim: true },
    recipientLastName: { type: String, trim: true },
    recipientId: { type: String, trim: true },
    recipientPhone: { type: String, trim: true },
    status: { type: String, default: 'Purchased' },
    images: [{ url: String, publicId: String }],
    documents: [{ originalName: String, title: String, url: String, publicId: String, resourceType: String }],
    isFeatured: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Car', carSchema);
