const { validationResult } = require('express-validator');
const Template = require('../models/Template');
const Session = require('../models/Session');
const User = require('../models/User');
const cortiService = require('../services/cortiService');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * Template Controller
 * Handles clinical document templates with role-based access
 * Integrates with Corti.AI for template generation
 */

/**
 * Generate template from session
 * POST /api/templates/generate
 */
const generateTemplate = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { 
      session_id, 
      type = 'brief-clinical-note', 
      title = null,
      referral = null,
      patient_info = {}
    } = req.body;

    // Get session
    const session = await Session.findOne({
      _id: session_id,
      user_id: req.user._id
    });

    if (!session) {
      return errorResponse(res, 'Session not found', 404);
    }

    // Generate template from Corti
    const templateData = await cortiService.generateTemplate(
      session.corti_interaction_id, 
      type
    );

    // Generate title if not provided
    const templateTitle = title || await cortiService.generateTitle(
      templateData.content, 
      req.user.specialty
    );

    // Create template in database
    const template = new Template({
      user_id: req.user._id,
      session_id: session._id,
      title: templateTitle,
      content: templateData.content,
      type,
      template_key: templateData.templateKey,
      specialty: req.user.specialty,
      status: 'draft',
      generated_from_facts: true,
      facts_snapshot: templateData.facts,
      referral,
      patient_info
    });

    const savedTemplate = await template.save();

    return successResponse(res, {
      template: savedTemplate,
      generation_info: {
        facts_used: templateData.facts.length,
        template_type: type,
        corti_template_key: templateData.templateKey
      }
    }, 'Template generated successfully', 201);

  } catch (error) {
    console.error('Generate template error:', error);
    return errorResponse(res, error.message || 'Failed to generate template', 500);
  }
};

/**
 * Regenerate template with updated facts
 * POST /api/templates/:id/regenerate
 */
const regenerateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { title = null } = req.body;

    const template = await Template.findOne({
      _id: id,
      user_id: req.user._id
    }).populate('session_id');

    if (!template) {
      return errorResponse(res, 'Template not found', 404);
    }

    if (!template.session_id) {
      return errorResponse(res, 'Template session not found', 404);
    }

    // Generate new template from current session facts
    const templateData = await cortiService.generateTemplate(
      template.session_id.corti_interaction_id, 
      template.type
    );

    // Create new version of template
    const newTemplate = await template.createNewVersion(
      templateData.content,
      title
    );

    // Update facts snapshot
    newTemplate.facts_snapshot = templateData.facts;
    await newTemplate.save();

    return successResponse(res, {
      template: newTemplate,
      previous_version: template._id,
      generation_info: {
        facts_used: templateData.facts.length,
        regeneration_count: newTemplate.regenerated_count
      }
    }, 'Template regenerated successfully', 201);

  } catch (error) {
    console.error('Regenerate template error:', error);
    return errorResponse(res, error.message || 'Failed to regenerate template', 500);
  }
};

/**
 * Get templates for user (role-based access)
 * GET /api/templates
 */
const getTemplates = async (req, res) => {
  try {
    const { 
      limit = 20, 
      page = 1, 
      status = null, 
      type = null,
      search = null 
    } = req.query;

    const options = {
      limit: parseInt(limit),
      skip: (page - 1) * parseInt(limit),
      status,
      type,
      search
    };

    // Role-based template retrieval
    let templates;
    let total;

    if (req.user.is_super_admin) {
      // Super admin can see all templates
      const query = {};
      if (status) query.status = status;
      if (type) query.type = type;
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ];
      }

      templates = await Template.find(query)
        .populate('user_id', 'name email specialty')
        .populate('session_id', 'corti_interaction_id duration')
        .sort({ created_at: -1 })
        .limit(options.limit)
        .skip(options.skip);

      total = await Template.countDocuments(query);

    } else if (req.user.role === 'company_admin' && req.user.company_id) {
      // Company admin can see templates from all users in their company
      templates = await Template.getCompanyTemplates(req.user.company_id, options);
      
      // Get total count for company templates
      const companyUsers = await User.find({ company_id: req.user.company_id }, '_id');
      const userIds = companyUsers.map(user => user._id);
      total = await Template.countDocuments({ user_id: { $in: userIds } });

    } else {
      // Regular user can only see their own templates
      templates = await Template.getTemplatesForUser(req.user, options);
      total = await Template.countDocuments({ user_id: req.user._id });
    }

    return successResponse(res, {
      templates,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / parseInt(limit)),
        total_templates: total,
        limit: parseInt(limit)
      },
      access_level: req.user.getAccessLevel()
    }, 'Templates retrieved successfully');

  } catch (error) {
    console.error('Get templates error:', error);
    return errorResponse(res, 'Failed to get templates', 500);
  }
};

/**
 * Get single template by ID
 * GET /api/templates/:id
 */
const getTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await Template.findById(id)
      .populate('user_id', 'name email specialty')
      .populate('session_id', 'corti_interaction_id duration facts')
      .populate('previous_version', 'title version created_at');

    if (!template) {
      return errorResponse(res, 'Template not found', 404);
    }

    // Check access permissions
    let canAccess = false;
    
    // Super admin can see all templates
    if (req.user.role === 'super_admin') {
      canAccess = true;
    }
    // Users can see their own templates
    else if (req.user._id.toString() === template.user_id._id.toString()) {
      canAccess = true;
    }
    // Company admins can see templates from users in their company
    else if (req.user.role === 'company_admin' && req.user.company_id) {
      const templateOwner = await User.findById(template.user_id._id);
      canAccess = templateOwner && templateOwner.company_id?.toString() === req.user.company_id?.toString();
    }
    
    if (!canAccess) {
      return errorResponse(res, 'Access denied', 403);
    }

    return successResponse(res, { template }, 'Template retrieved successfully');

  } catch (error) {
    console.error('Get template error:', error);
    return errorResponse(res, 'Failed to get template', 500);
  }
};

/**
 * Update template
 * PUT /api/templates/:id
 */
const updateTemplate = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { id } = req.params;
    const { title, content, status, referral } = req.body;

    const template = await Template.findOne({
      _id: id,
      user_id: req.user._id
    });

    if (!template) {
      return errorResponse(res, 'Template not found or access denied', 404);
    }

    // Update fields
    if (title) template.title = title;
    if (content) template.content = content;
    if (status) template.status = status;
    if (referral !== undefined) template.referral = referral;

    const updatedTemplate = await template.save();

    return successResponse(res, { template: updatedTemplate }, 'Template updated successfully');

  } catch (error) {
    console.error('Update template error:', error);
    return errorResponse(res, 'Failed to update template', 500);
  }
};

/**
 * Delete template
 * DELETE /api/templates/:id
 */
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await Template.findOne({
      _id: id,
      user_id: req.user._id
    });

    if (!template) {
      return errorResponse(res, 'Template not found or access denied', 404);
    }

    await Template.findByIdAndDelete(id);

    return successResponse(res, null, 'Template deleted successfully');

  } catch (error) {
    console.error('Delete template error:', error);
    return errorResponse(res, 'Failed to delete template', 500);
  }
};

/**
 * Finalize template (mark as final)
 * POST /api/templates/:id/finalize
 */
const finalizeTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await Template.findOne({
      _id: id,
      user_id: req.user._id
    });

    if (!template) {
      return errorResponse(res, 'Template not found or access denied', 404);
    }

    template.finalize();
    await template.save();

    return successResponse(res, { template }, 'Template finalized successfully');

  } catch (error) {
    console.error('Finalize template error:', error);
    return errorResponse(res, 'Failed to finalize template', 500);
  }
};

/**
 * Archive template
 * POST /api/templates/:id/archive
 */
const archiveTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await Template.findOne({
      _id: id,
      user_id: req.user._id
    });

    if (!template) {
      return errorResponse(res, 'Template not found or access denied', 404);
    }

    template.archive();
    await template.save();

    return successResponse(res, { template }, 'Template archived successfully');

  } catch (error) {
    console.error('Archive template error:', error);
    return errorResponse(res, 'Failed to archive template', 500);
  }
};

/**
 * Get template statistics
 * GET /api/templates/stats
 */
const getTemplateStats = async (req, res) => {
  try {
    let stats;

    if (req.user.is_super_admin) {
      // Super admin gets global stats
      stats = await Template.getTemplateStats();
    } else if (req.user.is_company_admin && req.user.company_id) {
      // Company admin gets company stats
      stats = await Template.getTemplateStats(null, req.user.company_id);
    } else {
      // Regular user gets personal stats
      stats = await Template.getTemplateStats(req.user._id);
    }

    const result = stats[0] || {
      total_templates: 0,
      draft_templates: 0,
      final_templates: 0,
      soap_templates: 0,
      brief_templates: 0,
      avg_regenerations: 0
    };

    return successResponse(res, { 
      stats: result,
      access_level: req.user.getAccessLevel()
    }, 'Template statistics retrieved successfully');

  } catch (error) {
    console.error('Get template stats error:', error);
    return errorResponse(res, 'Failed to get template statistics', 500);
  }
};

module.exports = {
  generateTemplate,
  regenerateTemplate,
  getTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  finalizeTemplate,
  archiveTemplate,
  getTemplateStats
}; 