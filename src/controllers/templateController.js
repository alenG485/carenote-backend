const { validationResult } = require('express-validator');
const Template = require('../models/Template');
const Session = require('../models/Session');
const cortiService = require('../services/cortiService');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * Template Controller
 * Handles clinical document templates based on session facts
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
      outputLanguage
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
      type,
      outputLanguage
    );
    // Generate title based on template type and session
    const templateTitle = type === 'soap' ? 'SOAP Note' : 'Brief Clinical Note';

    // Create or update template in database
    const template = await Template.getOrCreateTemplate(
      session._id,
      req.user._id,
      type,
      templateData.templateKey,
      templateTitle,
      templateData.content,
      templateData.facts,
      outputLanguage
    );

    return successResponse(res, {
      template: template,
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
 * Get templates for a session
 * GET /api/templates/session/:sessionId
 */
const getSessionTemplates = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Verify session belongs to user
    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id
    });

    if (!session) {
      return errorResponse(res, 'Session not found', 404);
    }

    // Get templates for this session
    const templates = await Template.getTemplatesForSession(sessionId, req.user._id);

    return successResponse(res, {
      templates: templates,
      session_id: sessionId
    }, 'Templates retrieved successfully');

  } catch (error) {
    console.error('Get session templates error:', error);
    return errorResponse(res, 'Failed to get session templates', 500);
  }
};

/**
 * Regenerate template with updated facts
 * POST /api/templates/:id/regenerate
 */
const regenerateTemplate = async (req, res) => {
  try {
    const { id } = req.params;

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
      template.type,
      template.output_language
    );

    // Update template with new content and facts
    template.regenerate(templateData.content, templateData.facts);
    await template.save();

    return successResponse(res, {
      template: template,
      generation_info: {
        facts_used: templateData.facts.length,
        regeneration_count: template.regenerated_count
      }
    }, 'Template regenerated successfully', 200);

  } catch (error) {
    console.error('Regenerate template error:', error);
    return errorResponse(res, error.message || 'Failed to regenerate template', 500);
  }
};

module.exports = {
  generateTemplate,
  getSessionTemplates,
  regenerateTemplate
}; 