const mongoose = require('mongoose');

/**
 * Lead Model
 * Captures early signup interest and marketing opt-in preferences
 */
const leadSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/, 'Please enter a valid email']
    },
    marketing_opt_in: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
  }
);

leadSchema.index({ email: 1 });
leadSchema.index({ source: 1 });

module.exports = mongoose.model('Lead', leadSchema);

