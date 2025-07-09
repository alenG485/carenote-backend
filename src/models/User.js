const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * User Model
 * Handles 3-level access system:
 * 1. Normal User (role: 'user')
 * 2. Company Admin (role: 'company_admin')
 * 3. Super Admin (role: 'super_admin')
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
    enum: ['user', 'company_admin', 'super_admin'],
    default: 'user'
  },
  
  // Company Relationship
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
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
userSchema.index({ company_id: 1 });
userSchema.index({ role: 1 });

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