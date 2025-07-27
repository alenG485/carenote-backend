const mongoose = require('mongoose');

/**
 * Session Model
 * Represents a recording session with Corti.AI
 * Handles WebSocket connections and facts extraction
 */

const sessionSchema = new mongoose.Schema({
  // User Reference
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Corti Integration Data
  corti_interaction_id: {
    type: String,
    required: true,
    unique: true
  },
  websocket_url: {
    type: String,
    required: true
  },
  access_token: {
    type: String,
    required: true
  },
  
  // Session Status
  status: {
    type: String,
    enum: ['active','started', 'completed', 'failed', 'cancelled'],
    default: 'active'
  },
  
  // Session Metadata
  session_title: {
    type: String,
    default: 'Recording Session'
  },
  specialty: {
    type: String,
    default: 'general'
  },
  
  // Recording Statistics
  duration: {
    type: Number, // Duration in seconds
    default: 0
  },
  started_at: {
    type: Date,
    default: Date.now
  },
  ended_at: {
    type: Date,
    default: null
  },
  
  // Additional Data
  patient_identifier: {
    type: String,
    default: null
  },
  encounter_type: {
    type: String,
    default: 'consultation'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes for performance (corti_interaction_id already indexed via unique: true)
sessionSchema.index({ user_id: 1, created_at: -1 }); // For recent sessions queries
sessionSchema.index({ user_id: 1, status: 1 }); // For status-based queries
sessionSchema.index({ created_at: -1 }); // For date-based queries
sessionSchema.index({ corti_interaction_id: 1 }); // For Corti ID lookups

// Virtual to calculate session duration
sessionSchema.virtual('calculated_duration').get(function() {
  if (this.ended_at && this.started_at) {
    return Math.floor((this.ended_at - this.started_at) / 1000); // Duration in seconds
  }
  return this.duration;
});

// Method to end the session
sessionSchema.methods.endSession = function() {
  this.status = 'completed';
  this.ended_at = new Date();
  
  // Calculate duration if not already set
  if (!this.duration && this.started_at) {
    this.duration = Math.floor((this.ended_at - this.started_at) / 1000);
  }
  
  return this;
};

// Static method to find active sessions for a user
sessionSchema.statics.findActiveSessions = function(userId) {
  return this.find({
    user_id: userId,
    status: 'active'
  }).sort({ created_at: -1 });
};

// Static method to get user sessions with stats
sessionSchema.statics.getUserSessionsWithStats = function(userId, limit = 10) {
  return this.find({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(limit)
    .select('corti_interaction_id status session_title duration started_at ended_at created_at');
};

module.exports = mongoose.model('Session', sessionSchema); 