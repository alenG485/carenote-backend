const mongoose = require('mongoose');

/**
 * Session Model
 * Represents a recording session with Corti.AI
 * Handles WebSocket connections and facts extraction
 */

// Fact schema for embedded facts in sessions
const factSchema = new mongoose.Schema({
  fact_id: {
    type: String, // Corti fact ID
    required: true
  },
  text: {
    type: String,
    required: true
  },
  group: {
    type: String,
    required: true
  },
  confidence: {
    type: Number,
    default: 1.0,
    min: 0,
    max: 1
  },
  source: {
    type: String,
    enum: ['ai', 'user'],
    default: 'ai'
  },
  is_discarded: {
    type: Boolean,
    default: false
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

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
  
  // Facts extracted during session
  facts: [factSchema],
  
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
sessionSchema.index({ user_id: 1 });
sessionSchema.index({ status: 1 });
sessionSchema.index({ created_at: -1 });

// Virtual to get active (non-discarded) facts
sessionSchema.virtual('active_facts').get(function() {
  return this.facts.filter(fact => !fact.is_discarded);
});

// Virtual to calculate session duration
sessionSchema.virtual('calculated_duration').get(function() {
  if (this.ended_at && this.started_at) {
    return Math.floor((this.ended_at - this.started_at) / 1000); // Duration in seconds
  }
  return this.duration;
});

// Method to add a fact to the session
sessionSchema.methods.addFact = function(factData) {
  const newFact = {
    fact_id: factData.fact_id || factData.id,
    text: factData.text,
    group: factData.group,
    confidence: factData.confidence || 1.0,
    source: factData.source || 'ai',
    is_discarded: false,
    created_at: new Date(),
    updated_at: new Date()
  };
  
  this.facts.push(newFact);
  return newFact;
};

// Method to update a fact in the session
sessionSchema.methods.updateFact = function(factId, updateData) {
  const fact = this.facts.id(factId);
  if (!fact) {
    throw new Error('Fact not found');
  }
  
  if (updateData.text) fact.text = updateData.text;
  if (updateData.group) fact.group = updateData.group;
  if (updateData.confidence !== undefined) fact.confidence = updateData.confidence;
  if (updateData.is_discarded !== undefined) fact.is_discarded = updateData.is_discarded;
  
  fact.updated_at = new Date();
  return fact;
};

// Method to discard (soft delete) a fact
sessionSchema.methods.discardFact = function(factId) {
  const fact = this.facts.id(factId);
  if (!fact) {
    throw new Error('Fact not found');
  }
  
  fact.is_discarded = true;
  fact.updated_at = new Date();
  return fact;
};

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

// Method to get facts grouped by category
sessionSchema.methods.getFactsByGroup = function() {
  const activeFacts = this.active_facts;
  const groupedFacts = {};
  
  activeFacts.forEach(fact => {
    if (!groupedFacts[fact.group]) {
      groupedFacts[fact.group] = [];
    }
    groupedFacts[fact.group].push(fact);
  });
  
  return groupedFacts;
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
    .select('corti_interaction_id status session_title duration started_at ended_at facts created_at');
};

// Pre-save middleware to update fact timestamps
sessionSchema.pre('save', function(next) {
  // Update updated_at for modified facts
  if (this.isModified('facts')) {
    this.facts.forEach(fact => {
      if (fact.isModified && fact.isModified()) {
        fact.updated_at = new Date();
      }
    });
  }
  next();
});

// Indexes for better performance with large datasets
sessionSchema.index({ user_id: 1, created_at: -1 }); // For recent sessions queries
sessionSchema.index({ user_id: 1, status: 1 }); // For status-based queries
sessionSchema.index({ created_at: -1 }); // For date-based queries
sessionSchema.index({ corti_interaction_id: 1 }); // For Corti ID lookups

module.exports = mongoose.model('Session', sessionSchema); 