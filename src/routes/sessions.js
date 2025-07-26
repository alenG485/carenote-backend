const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { sessionValidation, paramValidation, queryValidation } = require('../middleware/validation');

/**
 * Session Routes
 * Handles Corti.AI recording sessions, facts management, and WebSocket connections
 */

/**
 * @route   POST /api/sessions/start
 * @desc    Start a new recording session
 * @access  Private (requires active subscription)
 */
router.post('/start', 
  authenticate, 
  requireActiveSubscription,
  sessionValidation.start, 
  sessionController.startSession
);

/**
 * @route   GET /api/sessions
 * @desc    Get user's sessions with pagination
 * @access  Private
 */
router.get('/', 
  authenticate, 
  queryValidation.pagination,
  sessionController.getUserSessions
);

/**
 * @route   GET /api/sessions/:sessionId
 * @desc    Get session
 * @access  Private
 */
router.get('/:sessionId', 
  authenticate,
  paramValidation.mongoId('sessionId'),
  sessionController.getSession
);

/**
 * @route   GET /api/sessions/:sessionId/facts
 * @desc    Get session facts
 * @access  Private
 */
router.get('/:sessionId/facts', 
  authenticate,
  paramValidation.mongoId('sessionId'),
  sessionController.getSessionFacts
);

/**
 * @route   POST /api/sessions/:sessionId/facts
 * @desc    Add fact to session
 * @access  Private
 */
router.post('/:sessionId/facts', 
  authenticate,
  paramValidation.mongoId('sessionId'),
  sessionValidation.addFact,
  sessionController.addFact
);

/**
 * @route   PUT /api/sessions/:sessionId/facts/:factId
 * @desc    Update fact in session
 * @access  Private
 */
router.put('/:sessionId/facts/:factId', 
  authenticate,
  paramValidation.mongoId('sessionId'),
  paramValidation.mongoId('factId'),
  sessionValidation.updateFact,
  sessionController.updateFact
);

/**
 * @route   POST /api/sessions/:sessionId/start-recording
 * @desc    Start session recording
 * @access  Private
 */
router.post('/:sessionId/start-recording', 
  authenticate,
  paramValidation.mongoId('sessionId'),
  sessionController.startSessionRecording
);

/**
 * @route   POST /api/sessions/:sessionId/end
 * @desc    End recording session
 * @access  Private
 */
router.post('/:sessionId/end', 
  authenticate,
  paramValidation.mongoId('sessionId'),
  sessionController.endSession
);

module.exports = router; 