const mongoose = require('mongoose');

const carSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    make: { type: String, trim: true },
    model: { type: String, trim: true },
    year: { type: Number },
    vin: { type: String, trim: true },
    price: { type: Number },
    status: { type: String, default: 'available', lowercase: true },
    description: { type: String },
    photos: [{ type: String }],
    featured: { type: Boolean, default: false },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Car', carSchema);
