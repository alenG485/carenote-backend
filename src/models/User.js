const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * User Model
 * Simplified user model without Company:
 * - Individual users: workplace (their own), is_company_admin: false, invited_by: null
 * - Clinic main user: workplace (company name), is_company_admin: true, invited_by: null, has subscription
 * - Clinic invited users: workplace (same as main), is_company_admin: false, invited_by: main_user_id, no subscription
 */

const userSchema = new mongoose.Schema({
  // Basic Authentication
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  
  // Profile Information
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  specialty: {
    type: String
    },
  workplace: {
    type: String,
    trim: true
  },
  journalSystem: {
    type: String
  },
  
  // Role & Permission System
  role: {
    type: String,
    enum: ['user', 'super_admin'],
    default: 'user'
  },
  
  // Company Admin status (true for clinic main user)
  is_company_admin: {
    type: Boolean,
    default: false
  },
  
  // Permission to invite users (future feature)
  can_invite: {
    type: Boolean,
    default: false
  },
  
  // User status
  is_active: {
    type: Boolean,
    default: true
  },
  
  // Invitation fields
  invitation_token: {
    type: String,
    default: null
  },
  invited_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Subscription
  subscription_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    default: null
  },
  
  // Account Status
  email_verified: {
    type: Boolean,
    default: false
  },
  verification_token: {
    type: String,
    default: null
  },
  reset_password_token: {
    type: String,
    default: null
  },
  reset_password_expires: {
    type: Date,
    default: null
  },
  
  // Deactivation tracking
  deactivated_at: {
    type: Date,
    default: null
  },
  deactivated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes for performance (email already indexed via unique: true)
userSchema.index({ invited_by: 1 });
userSchema.index({ is_company_admin: 1 });
userSchema.index({ role: 1 });
userSchema.index({ workplace: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Set super admin status based on email
userSchema.pre('save', function(next) {
  if (this.email === process.env.SUPER_ADMIN_EMAIL) {
    this.role = 'super_admin';
  }
  next();
});

// Note: is_company_admin is set explicitly during registration/updates
// It's not automatically synced from role anymore

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Instance method to get user's access level
userSchema.methods.getAccessLevel = function() {
  return this.role;
};

// Virtual for full name (if you want to split first/last name later)
userSchema.virtual('display_name').get(function() {
  return this.name;
});

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.verification_token;
  delete userObject.reset_password_token;
  return userObject;
};

module.exports = mongoose.model('User', userSchema); 