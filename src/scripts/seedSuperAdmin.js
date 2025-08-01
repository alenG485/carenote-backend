require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { connectDB, disconnectDB } = require('../config/database');

/**
 * Seed Super Admin Script
 * Creates a super admin user if it doesn't exist
 */

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@carenote.dk';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'admin123456';
const SUPER_ADMIN_NAME = process.env.SUPER_ADMIN_NAME || 'CareNote Admin';

async function seedSuperAdmin() {
  try {
    
    // Connect to database
    await connectDB();

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ 
      email: SUPER_ADMIN_EMAIL,
      role: 'super_admin'
    });

    if (existingSuperAdmin) {
      console.log('Super Admin Already Exists')
      return;
    }

    // Create new super admin user
    const superAdmin = new User({
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
      name: SUPER_ADMIN_NAME,
      role: 'super_admin',
      email_verified: true,
      is_active: true,
      specialty: 'admin',
      workplace: 'CareNote',
      journalSystem: 'admin'
    });

    await superAdmin.save();
    console.log('✅ Super admin user created successfully');
    

    // Create subscription for super admin
    const subscription = new Subscription({
      user_id: superAdmin._id,
      plan_name: 'super_admin',
      status: 'active',
      is_trial: false,
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 100), // 100 year
      billing_amount: 0,
      billing_currency: 'DKK',
      billing_interval: 'yearly'
    });

    await subscription.save();

    // Link subscription to user
    superAdmin.subscription_id = subscription._id;
    await superAdmin.save();
    console.log('✅ Subscription linked to super admin user');

  } catch (error) {
    console.error('❌ Error seeding super admin:', error);
    process.exit(1);
  } finally {
    // Disconnect from database
    await disconnectDB();
  }
}

// Run the seed function
if (require.main === module) {
  seedSuperAdmin()
    .then(() => {
      console.log('✅ Seed script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedSuperAdmin }; 