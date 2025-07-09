const mongoose = require('mongoose');

/**
 * Company Model
 * Represents clinics/companies that have multiple users
 * Created automatically when a user registers with company_admin role
 */

const companySchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  
  // Subscription & Limits
  max_users: {
    type: Number,
    default: 1,
    min: 1
  },
  current_user_count: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Company Admin
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes for performance (name already indexed via unique: true)
companySchema.index({ created_by: 1 });

// Virtual to check if company can add more users
companySchema.virtual('can_add_users').get(function() {
  return this.current_user_count < this.max_users;
});

// Virtual to get remaining user slots
companySchema.virtual('remaining_user_slots').get(function() {
  return Math.max(0, this.max_users - this.current_user_count);
});



// Pre-save middleware to validate user count
companySchema.pre('save', function(next) {
  if (this.current_user_count > this.max_users) {
    return next(new Error(`Current user count (${this.current_user_count}) cannot exceed max users (${this.max_users})`));
  }
  next();
});

module.exports = mongoose.model('Company', companySchema); 