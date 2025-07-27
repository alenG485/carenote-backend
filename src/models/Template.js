const mongoose = require('mongoose');

/**
 * Template Model
 * Stores generated clinical documents from Corti.AI based on session facts
 */

const templateSchema = new mongoose.Schema({
  // User & Session References
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true
  },
  
  // Template Content
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  
  // Template Type & Metadata
  type: {
    type: String,
    enum: ['soap', 'brief-clinical-note'],
    required: true
  },
  template_key: {
    type: String, // Corti template key used
    required: true
  },
  specialty: {
    type: String,
    default: 'general'
  },
  output_language: {
    type: String,
    default: 'da'
  },
  // AI Generation Info
  facts_snapshot: {
    type: [mongoose.Schema.Mixed], // Snapshot of facts used for generation
    default: []
  },
  
  // Regeneration tracking
  regenerated_count: {
    type: Number,
    default: 0
  },
  last_regenerated_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes for performance
templateSchema.index({ user_id: 1 });
templateSchema.index({ session_id: 1 });
templateSchema.index({ session_id: 1, type: 1 }); // Compound index for session templates
templateSchema.index({ created_at: -1 });

// Method to regenerate template
templateSchema.methods.regenerate = function(newContent, newFacts) {
  this.content = newContent;
  this.facts_snapshot = newFacts;
  this.regenerated_count += 1;
  this.last_regenerated_at = new Date();
  return this;
};

// Static method to get templates for a session
templateSchema.statics.getTemplatesForSession = function(sessionId, userId) {
  return this.find({
  session_id: sessionId,
    user_id: userId
  }).sort({ created_at: -1 });
};

// Static method to get or create template for session and type
templateSchema.statics.getOrCreateTemplate = function(sessionId, userId, type, templateKey, title, content, facts, outputLanguage) {
  return this.findOneAndUpdate(
    {
      session_id: sessionId,
      user_id: userId,
      type: type
    },
    {
      title: title,
      content: content,
      template_key: templateKey,
      facts_snapshot: facts,
      output_language: outputLanguage,
      $inc: { regenerated_count: 1 },
      last_regenerated_at: new Date()
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
};

module.exports = mongoose.model('Template', templateSchema); 