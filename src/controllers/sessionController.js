const { validationResult } = require('express-validator');
const Session = require('../models/Session');
const cortiService = require('../services/cortiService');
const { successResponse, errorResponse } = require('../utils/responses');

/**
 * Session Controller
 * Handles Corti.AI recording sessions, facts management, and WebSocket connections
 */

/**
 * Start a new recording session
 * POST /api/sessions/start
 */
const startSession = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { 
      session_title = 'Recording Session',
      specialty = 'general',
      patient_identifier = null,
      encounter_type = 'consultation',
      patient_data = {}
    } = req.body;

    // Create interaction with Corti API
    const interactionResponse = await cortiService.createInteraction(req.user._id, patient_data);
    
    if (!interactionResponse || !interactionResponse.id) {
      return errorResponse(res, 'Failed to create Corti interaction', 500);
    }

    // Create session in database
    const session = new Session({
      user_id: req.user._id,
      corti_interaction_id: interactionResponse.id,
      websocket_url: interactionResponse.websocketUrl,
      access_token: interactionResponse.accessToken,
      session_title,
      specialty,
      patient_identifier,
      encounter_type,
      status: 'active',
      started_at: new Date()
    });

    const savedSession = await session.save();

    return successResponse(res, {
      session: savedSession,
      websocket_url: interactionResponse.websocketUrl,
      access_token: interactionResponse.accessToken,
      interaction_id: interactionResponse.id
    }, 'Session started successfully', 201);

  } catch (error) {
    console.error('Start session error:', error);
    return errorResponse(res, error.message || 'Failed to start session', 500);
  }
};

/**
 * Get WebSocket URL for active session
 * GET /api/sessions/:sessionId/ws-url
 */
const getWebSocketUrl = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id,
      status: 'active'
    });

    if (!session) {
      return errorResponse(res, 'Active session not found', 404);
    }

    return successResponse(res, {
      websocket_url: session.websocket_url,
      access_token: session.access_token,
      interaction_id: session.corti_interaction_id
    }, 'WebSocket URL retrieved successfully');

  } catch (error) {
    console.error('Get WebSocket URL error:', error);
    return errorResponse(res, 'Failed to get WebSocket URL', 500);
  }
};

/**
 * Get session facts
 * GET /api/sessions/:sessionId/facts
 */
const getSessionFacts = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id
    });

    if (!session) {
      return errorResponse(res, 'Session not found', 404);
    }

    // Get latest facts from Corti API
    try {
      const cortiFacts = await cortiService.getFacts(session.corti_interaction_id);
      
      // Update session facts
      session.facts = cortiFacts.map(fact => ({
        fact_id: fact.id,
        text: fact.text,
        group: fact.group,
        confidence: fact.confidence || 1.0,
        source: fact.source || 'ai',
        is_discarded: fact.isDiscarded || false,
        created_at: fact.createdAt ? new Date(fact.createdAt) : new Date(),
        updated_at: fact.updatedAt ? new Date(fact.updatedAt) : new Date()
      }));

      await session.save();
    } catch (cortiError) {
      console.warn('Failed to sync facts from Corti:', cortiError.message);
      // Continue with stored facts if Corti API fails
    }

    // Return facts grouped by category
    const factsByGroup = session.getFactsByGroup();

    return successResponse(res, {
      session_id: session._id,
      facts: session.active_facts,
      facts_by_group: factsByGroup,
      total_facts: session.facts.length,
      active_facts: session.active_facts.length
    }, 'Session facts retrieved successfully');

  } catch (error) {
    console.error('Get session facts error:', error);
    return errorResponse(res, 'Failed to get session facts', 500);
  }
};

/**
 * Add fact to session
 * POST /api/sessions/:sessionId/facts
 */
const addFact = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { sessionId } = req.params;
    const { text, group, confidence = 1.0 } = req.body;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id,
      status: 'active'
    });

    if (!session) {
      return errorResponse(res, 'Active session not found', 404);
    }

    // Add fact to Corti API
    const cortiResponse = await cortiService.addFact(session.corti_interaction_id, {
      text,
      group,
      source: 'user'
    });

    // Add fact to session
    const newFact = session.addFact({
      fact_id: cortiResponse.facts?.[0]?.id || `local_${Date.now()}`,
      text,
      group,
      confidence,
      source: 'user'
    });

    await session.save();

    return successResponse(res, {
      fact: newFact,
      session_id: session._id
    }, 'Fact added successfully', 201);

  } catch (error) {
    console.error('Add fact error:', error);
    return errorResponse(res, error.message || 'Failed to add fact', 500);
  }
};

/**
 * Update fact in session
 * PUT /api/sessions/:sessionId/facts/:factId
 */
const updateFact = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 'Validation failed', 400, errors.array());
    }

    const { sessionId, factId } = req.params;
    const { text, group, confidence, is_discarded } = req.body;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id
    });

    if (!session) {
      return errorResponse(res, 'Session not found', 404);
    }

    // Update fact in Corti API
    try {
      const fact = session.facts.id(factId);
      if (fact && fact.fact_id) {
        await cortiService.updateFact(session.corti_interaction_id, fact.fact_id, {
          text: text || fact.text,
          group: group || fact.group,
          isDiscarded: is_discarded !== undefined ? is_discarded : fact.is_discarded
        });
      }
    } catch (cortiError) {
      console.warn('Failed to update fact in Corti:', cortiError.message);
      // Continue with local update if Corti API fails
    }

    // Update fact in session
    const updatedFact = session.updateFact(factId, {
      text,
      group,
      confidence,
      is_discarded
    });

    await session.save();

    return successResponse(res, {
      fact: updatedFact,
      session_id: session._id
    }, 'Fact updated successfully');

  } catch (error) {
    console.error('Update fact error:', error);
    return errorResponse(res, error.message || 'Failed to update fact', 500);
  }
};

/**
 * End recording session
 * POST /api/sessions/:sessionId/end
 */
const endSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id,
      status: 'active'
    });

    if (!session) {
      return errorResponse(res, 'Active session not found', 404);
    }

    // End the session
    session.endSession();
    await session.save();

    return successResponse(res, {
      session: session,
      duration: session.calculated_duration,
      facts_count: session.active_facts.length
    }, 'Session ended successfully');

  } catch (error) {
    console.error('End session error:', error);
    return errorResponse(res, 'Failed to end session', 500);
  }
};

/**
 * Get user's sessions
 * GET /api/sessions
 */
const getUserSessions = async (req, res) => {
  try {
    const { limit = 10, page = 1, status } = req.query;
    const skip = (page - 1) * limit;

    let query = { user_id: req.user._id };
    if (status) {
      query.status = status;
    }

    const sessions = await Session.find(query)
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .select('corti_interaction_id status session_title duration started_at ended_at facts created_at');

    const total = await Session.countDocuments(query);

    // Add session statistics
    const sessionStats = sessions.map(session => ({
      ...session.toJSON(),
      facts_count: session.facts.length,
      active_facts_count: session.active_facts.length
    }));

    return successResponse(res, {
      sessions: sessionStats,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / limit),
        total_sessions: total,
        limit: parseInt(limit)
      }
    }, 'Sessions retrieved successfully');

  } catch (error) {
    console.error('Get user sessions error:', error);
    return errorResponse(res, 'Failed to get sessions', 500);
  }
};

module.exports = {
  startSession,
  getWebSocketUrl,
  getSessionFacts,
  addFact,
  updateFact,
  endSession,
  getUserSessions
}; 