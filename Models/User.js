const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'dealer'], required: true, default: 'dealer', lowercase: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
