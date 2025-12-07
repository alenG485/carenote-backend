const express = require('express');
const router = express.Router();
const { authenticate, requireCompanyAdmin } = require('../middleware/auth');
const { companyValidation } = require('../middleware/validation');
const {
  getClinicData,
  inviteUser,
  updateUserStatus,
  resendInvitation
} = require('../controllers/clinicController');

// All routes require authentication and company admin access
router.use(authenticate);
router.use(requireCompanyAdmin);

// Get clinic data
router.get('/data', getClinicData);

// Invite user to clinic (with validation middleware for email normalization)
router.post('/invite', companyValidation.inviteUser, inviteUser);

// Update user status (activate/deactivate/remove)
router.put('/users/:userId/status', updateUserStatus);

// Resend invitation email
router.post('/users/:userId/resend-invitation', resendInvitation);

module.exports = router; 