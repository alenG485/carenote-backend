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

    // Find session and verify user owns it
    const session = await Session.findById(session_id);
    
    if (!session) {
      return errorResponse(res, 'Session ikke fundet', 404);
    }

    // User can only generate templates for their own sessions
    if (session.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Adgang nægtet til denne session', 403);
    }

    // Generate template from Corti
    const templateData = await cortiService.generateTemplate(
      session.corti_interaction_id, 
      type,
      outputLanguage
    );
    
    // Generate title based on template type
    const templateTitle = type === 'soap' ? 'SOAP Note' : 'Brief Clinical Note';

    // Create or update template in database
    const template = await Template.getOrCreateTemplate(
      session._id,
      req.user._id, // Use current user's ID
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
    }, 'Skabelon genereret succesfuldt', 201);

  } catch (error) {
    console.error('Generate template error:', error);
    return errorResponse(res, error.message || 'Kunne ikke generere skabelon', 500);
  }
};

/**
 * Get templates for a session
 * GET /api/templates/session/:sessionId
 * Access control handled by requireSessionAccess middleware
 */
const getSessionTemplates = async (req, res) => {
  try {
    // Session is already loaded and access verified by requireSessionAccess middleware
    const session = req.session;

    // User can only see their own templates
    const templates = await Template.getTemplatesForSession(session._id, req.user._id);

    return successResponse(res, {
      templates: templates,
      session_id: session._id
    }, 'Skabeloner hentet succesfuldt');

  } catch (error) {
    console.error('Get session templates error:', error);
    return errorResponse(res, 'Kunne ikke hente session skabeloner', 500);
  }
};

/**
 * Regenerate template with updated facts
 * POST /api/templates/:id/regenerate
 */
const regenerateTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await Template.findById(id).populate('session_id');

    if (!template) {
      return errorResponse(res, 'Skabelon ikke fundet', 404);
    }

    if (!template.session_id) {
      return errorResponse(res, 'Skabelon session ikke fundet', 404);
    }

    // User can only regenerate their own templates
    if (template.user_id.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Adgang nægtet til denne skabelon', 403);
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
    }, 'Skabelon regenereret succesfuldt', 200);

  } catch (error) {
    console.error('Regenerate template error:', error);
    return errorResponse(res, error.message || 'Kunne ikke regenerere skabelon', 500);
  }
};

module.exports = {
  generateTemplate,
  getSessionTemplates,
  regenerateTemplate
}; 