const express = require('express');
const router = express.Router();
const { authenticate, requireCompanyAdmin } = require('../middleware/auth');
const {
  getClinicData,
  inviteUser,
  updateUserStatus
} = require('../controllers/clinicController');

// All routes require authentication and company admin access
router.use(authenticate);
router.use(requireCompanyAdmin);

// Get clinic data
router.get('/data', getClinicData);

// Invite user to clinic
router.post('/invite', inviteUser);

// Update user status (activate/deactivate/remove)
router.put('/users/:userId/status', updateUserStatus);

module.exports = router; 