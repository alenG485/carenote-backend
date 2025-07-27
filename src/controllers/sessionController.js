const { validationResult } = require('express-validator');
const Session = require('../models/Session');
const User = require('../models/User');
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

    const token = await cortiService.getAccessToken();


    // Create session in database
    const session = new Session({
      user_id: req.user._id,
      corti_interaction_id: interactionResponse.interactionId,
      websocket_url: interactionResponse.websocketUrl,
      access_token: token,
      session_title,
      specialty,
      patient_identifier,
      encounter_type,
      status: 'active',
      started_at: new Date()
    });

    const savedSession = await session.save();

    return successResponse(res, {
      session: savedSession
    }, 'Session started successfully', 201);

  } catch (error) {
    console.error('Start session error:', error);
    return errorResponse(res, error.message || 'Failed to start session', 500);
  }
};

/**
 * Get session
 * GET /api/sessions/:sessionId
 */
const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findOne({
      _id: sessionId,
      user_id: req.user._id
    });

    if (!session) {
      return errorResponse(res, 'Active session not found', 404);
    }

    return successResponse(res, {
      session: session
    }, 'Session retrieved successfully');

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
 * Start session recording
 * POST /api/sessions/:sessionId/start-recording
 */
const startSessionRecording = async (req, res) => {
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

    // Update session status to started
    session.status = 'started';
    await session.save();

    return successResponse(res, {
      session: session
    }, 'Session recording started successfully');

  } catch (error) {
    console.error('Start session recording error:', error);
    return errorResponse(res, 'Failed to start session recording', 500);
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
      user_id: req.user._id
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
 * Get user's sessions (with pagination for all sessions)
 * GET /api/sessions
 */
const getUserSessions = async (req, res) => {
  try {
    const { limit = 50, page = 1, status, days, user_id } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    // Handle different user roles
    if (req.user.role === 'super_admin') {
      // Super admin can see all sessions
      if (user_id) {
        query.user_id = user_id;
      }
    } else if (req.user.role === 'company_admin') {
      // Company admin can see sessions from users in their company
      if (user_id) {
        // Verify the user belongs to the company admin's company
        const targetUser = await User.findById(user_id);
        if (!targetUser || targetUser.company_id?.toString() !== req.user.company_id?.toString()) {
          return errorResponse(res, 'Access denied to this user\'s sessions', 403);
        }
        query.user_id = user_id;
      } else {
        // Get all users in the company
        const companyUsers = await User.find({ company_id: req.user.company_id }).select('_id');
        const userIds = companyUsers.map(user => user._id);
        query.user_id = { $in: userIds };
      }
    } else {
      // Regular user can only see their own sessions
      query.user_id = req.user._id;
    }
    
    // Add status filter if provided
    if (status) {
      query.status = status;
    }

    // Add date filter if days parameter is provided
    if (days) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(days));
      query.created_at = { $gte: daysAgo };
    }

    const sessions = await Session.find(query)
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .select('corti_interaction_id status session_title duration started_at ended_at facts created_at user_id')
      .populate('user_id', 'name email specialty')
      .lean(); // Use lean() for better performance with large datasets

    const total = await Session.countDocuments(query);

    // Add session statistics
    const sessionStats = sessions.map(session => ({
      ...session,
      facts_count: session.facts ? session.facts.length : 0,
      active_facts_count: session.facts ? session.facts.filter(fact => !fact.is_discarded).length : 0
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

/**
 * Get company users and their recent sessions (for company admins)
 * GET /api/sessions/company
 */
const getCompanySessions = async (req, res) => {
  try {
    const { limit = 50, days = 7 } = req.query;

    // Only company admins and super admins can access this
    if (req.user.role !== 'company_admin' && req.user.role !== 'super_admin') {
      return errorResponse(res, 'Company admin access required', 403);
    }

    let companyId = req.user.company_id;
    
    // Super admin can specify company_id
    if (req.user.role === 'super_admin' && req.query.company_id) {
      companyId = req.query.company_id;
    }

    if (!companyId) {
      return errorResponse(res, 'Company ID required', 400);
    }

    // Calculate date filter
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));
    daysAgo.setHours(0, 0, 0, 0);

    // Get all users in the company
    const companyUsers = await User.find({ company_id: companyId })
      .select('_id name email specialty role')
      .lean();

    const userIds = companyUsers.map(user => user._id);

    // Get sessions for all company users
    const sessions = await Session.find({
      user_id: { $in: userIds },
      created_at: { $gte: daysAgo }
    })
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .select('corti_interaction_id status session_title duration started_at ended_at facts created_at user_id')
      .populate('user_id', 'name email specialty')
      .lean();

    // Group sessions by user
    const userSessions = {};
    companyUsers.forEach(user => {
      userSessions[user._id] = {
        user: user,
        sessions: [],
        total_sessions: 0,
        total_facts: 0
      };
    });

    // Populate sessions for each user
    sessions.forEach(session => {
      const userId = session.user_id._id;
      if (userSessions[userId]) {
        userSessions[userId].sessions.push(session);
        userSessions[userId].total_sessions++;
        userSessions[userId].total_facts += session.facts ? session.facts.filter(fact => !fact.is_discarded).length : 0;
      }
    });

    // Convert to array and sort by total sessions
    const companyData = Object.values(userSessions)
      .sort((a, b) => b.total_sessions - a.total_sessions);

    return successResponse(res, {
      company_users: companyData,
      total_users: companyUsers.length,
      total_sessions: sessions.length,
      date_range: `${days} days`
    }, 'Company sessions retrieved successfully');

  } catch (error) {
    console.error('Get company sessions error:', error);
    return errorResponse(res, 'Failed to get company sessions', 500);
  }
};

/**
 * Get recent sessions (last 2 days only)
 * GET /api/sessions/recent
 */
const getRecentSessions = async (req, res) => {
  try {
    const { limit = 100, user_id } = req.query;

    // Calculate date 2 days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(0, 0, 0, 0); // Start of day

    let query = { 
      created_at: { $gte: twoDaysAgo }
    };

    // Handle different user roles
    if (req.user.role === 'super_admin') {
      // Super admin can see all sessions
      if (user_id) {
        query.user_id = user_id;
      }
    } else if (req.user.role === 'company_admin') {
      // Company admin can see sessions from users in their company
      if (user_id) {
        // Verify the user belongs to the company admin's company
        const targetUser = await User.findById(user_id);
        if (!targetUser || targetUser.company_id?.toString() !== req.user.company_id?.toString()) {
          return errorResponse(res, 'Access denied to this user\'s sessions', 403);
        }
        query.user_id = user_id;
      } else {
        // Get all users in the company
        const companyUsers = await User.find({ company_id: req.user.company_id }).select('_id');
        const userIds = companyUsers.map(user => user._id);
        query.user_id = { $in: userIds };
      }
    } else {
      // Regular user can only see their own sessions
      query.user_id = req.user._id;
    }

    const sessions = await Session.find(query)
      .sort({ created_at: -1 })
      .limit(parseInt(limit))
      .select('corti_interaction_id status session_title duration started_at ended_at facts created_at user_id')
      .populate('user_id', 'name email specialty')
      .lean(); // Use lean() for better performance

    // Add session statistics
    const sessionStats = sessions.map(session => ({
      ...session,
      facts_count: session.facts ? session.facts.length : 0,
      active_facts_count: session.facts ? session.facts.filter(fact => !fact.is_discarded).length : 0
    }));

    return successResponse(res, {
      sessions: sessionStats,
      total_sessions: sessionStats.length
    }, 'Recent sessions retrieved successfully');

  } catch (error) {
    console.error('Get recent sessions error:', error);
    return errorResponse(res, 'Failed to get recent sessions', 500);
  }
};

module.exports = {
  startSession,
  getSession,
  getSessionFacts,
  addFact,
  updateFact,
  startSessionRecording,
  endSession,
  getUserSessions,
  getRecentSessions,
  getCompanySessions
}; 