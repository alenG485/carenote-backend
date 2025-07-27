const mongoose = require('mongoose');

/**
 * Template Model
 * Stores generated clinical documents from Corti.AI
 * Supports role-based access (users see own, company admins see all in company, super admin sees all)
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
  transcription: {
    type: String,
    default: null
  },
  
  // Template Type & Metadata
  type: {
    type: String,
    enum: ['soap', 'brief-clinical-note', 'custom'],
    default: 'brief-clinical-note'
  },
  template_key: {
    type: String, // Corti template key used
    default: null
  },
  specialty: {
    type: String,
    default: 'general'
  },
  
  // Document Status
  status: {
    type: String,
    enum: ['draft', 'final', 'archived'],
    default: 'draft'
  },
  
  // AI Generation Info
  generated_from_facts: {
    type: Boolean,
    default: true
  },
  facts_snapshot: {
    type: [mongoose.Schema.Mixed], // Snapshot of facts used for generation
    default: []
  },
  
  // Additional Clinical Data
  referral: {
    type: String,
    default: null
  },
  patient_info: {
    age: {
      type: Number,
      min: 0,
      max: 200
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'unknown'],
      default: 'unknown'
    },
    identifier: {
      type: String,
      default: null
    }
  },
  
  // Version Control
  version: {
    type: Number,
    default: 1
  },
  previous_version: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template',
    default: null
  },
  
  // Sharing & Permissions
  is_shared: {
    type: Boolean,
    default: false
  },
  shared_with: [{
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permission: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view'
    },
    shared_at: {
      type: Date,
      default: Date.now
    }
  }],
  
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

// Indexes for performance and role-based queries
templateSchema.index({ user_id: 1 });
templateSchema.index({ session_id: 1 });
templateSchema.index({ type: 1 });
templateSchema.index({ status: 1 });
templateSchema.index({ created_at: -1 });
templateSchema.index({ user_id: 1, created_at: -1 }); // Compound index for user templates

// Virtual to get template age in days
templateSchema.virtual('age_in_days').get(function() {
  const now = new Date();
  const created = new Date(this.created_at);
  return Math.floor((now - created) / (1000 * 60 * 60 * 24));
});

// Virtual to check if template needs regeneration (facts changed)
templateSchema.virtual('needs_regeneration').get(function() {
  // This would need to be determined by comparing with current session facts
  return false; // Placeholder - implement logic in controller
});

// Method to create a new version of the template
templateSchema.methods.createNewVersion = async function(newContent, newTitle = null) {
  const Template = mongoose.model('Template');
  
  const newTemplate = new Template({
    user_id: this.user_id,
    session_id: this.session_id,
    title: newTitle || this.title,
    content: newContent,
    transcription: this.transcription,
    type: this.type,
    template_key: this.template_key,
    specialty: this.specialty,
    status: 'draft',
    generated_from_facts: this.generated_from_facts,
    facts_snapshot: this.facts_snapshot,
    patient_info: this.patient_info,
    version: this.version + 1,
    previous_version: this._id,
    regenerated_count: this.regenerated_count + 1,
    last_regenerated_at: new Date()
  });
  
  return await newTemplate.save();
};

// Method to finalize template (mark as final)
templateSchema.methods.finalize = function() {
  this.status = 'final';
  return this;
};

// Method to archive template
templateSchema.methods.archive = function() {
  this.status = 'archived';
  return this;
};

// Method to share template with users
templateSchema.methods.shareWith = function(userId, permission = 'view') {
  // Check if already shared with this user
  const existingShare = this.shared_with.find(share => 
    share.user_id.toString() === userId.toString()
  );
  
  if (existingShare) {
    existingShare.permission = permission;
    existingShare.shared_at = new Date();
  } else {
    this.shared_with.push({
      user_id: userId,
      permission,
      shared_at: new Date()
    });
  }
  
  this.is_shared = true;
  return this;
};

// Static method to get templates for a user (role-based)
templateSchema.statics.getTemplatesForUser = function(currentUser, options = {}) {
  const { 
    limit = 20, 
    skip = 0, 
    status = null, 
    type = null,
    search = null 
  } = options;
  
  let query = {};
  
  // Role-based access control
  if (currentUser.is_super_admin) {
    // Super admin can see all templates
    query = {};
  } else if (currentUser.is_company_admin && currentUser.company_id) {
    // Company admin can see templates from users in their company
    // This would need a lookup to User model to check company_id
    query = {
      $or: [
        { user_id: currentUser._id }, // Own templates
        // Company templates - implement with aggregation pipeline
      ]
    };
  } else {
    // Regular user can only see own templates
    query = { user_id: currentUser._id };
  }
  
  // Apply filters
  if (status) query.status = status;
  if (type) query.type = type;
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } }
    ];
  }
  
  return this.find(query)
    .populate('user_id', 'name email specialty')
    .populate('session_id', 'corti_interaction_id')
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to get company templates for admin
templateSchema.statics.getCompanyTemplates = async function(companyId, options = {}) {
  const User = mongoose.model('User');
  const { limit = 20, skip = 0 } = options;
  
  // Get all users in the company
  const companyUsers = await User.find({ company_id: companyId }, '_id');
  const userIds = companyUsers.map(user => user._id);
  
  return this.find({ user_id: { $in: userIds } })
    .populate('user_id', 'name email specialty')
    .populate('session_id', 'corti_interaction_id')
    .sort({ created_at: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to get template statistics for admin dashboard
templateSchema.statics.getTemplateStats = function(userId = null, companyId = null) {
  let matchStage = {};
  
  if (companyId) {
    // Get stats for company - would need aggregation with User lookup
    matchStage = { company_id: companyId };
  } else if (userId) {
    matchStage = { user_id: userId };
  }
  
  return this.aggregate([
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $group: {
        _id: null,
        total_templates: { $sum: 1 },
        draft_templates: {
          $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] }
        },
        final_templates: {
          $sum: { $cond: [{ $eq: ['$status', 'final'] }, 1, 0] }
        },
        soap_templates: {
          $sum: { $cond: [{ $eq: ['$type', 'soap'] }, 1, 0] }
        },
        brief_templates: {
          $sum: { $cond: [{ $eq: ['$type', 'brief-clinical-note'] }, 1, 0] }
        },
        avg_regenerations: { $avg: '$regenerated_count' }
      }
    }
  ]);
};

module.exports = mongoose.model('Template', templateSchema); 