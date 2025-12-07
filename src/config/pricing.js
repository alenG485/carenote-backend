/**
 * Unified Pricing Configuration
 * Single source of truth for all pricing information
 * All prices are in DKK and exclude VAT (moms)
 */

const pricingConfig = {
  currency: 'DKK',
  vatIncluded: false,
  vatRate: 0.25, // 25% VAT for Denmark (not calculated, just for reference)
  trialDays: 10, // Free trial period in days
  
  // Monthly pricing tiers
  monthly: {
    tiers: [
      {
        minLicenses: 1,
        pricePerLicense: 559,
        label: '1+ licenser',
        savings: null,
        originalPrice: null
      },
      {
        minLicenses: 3,
        pricePerLicense: 528,
        label: '3+ licenser',
        savings: {
          percentage: 6,
          originalPrice: 559
        }
      },
      {
        minLicenses: 5,
        pricePerLicense: 503,
        label: '5+ licenser',
        savings: {
          percentage: 10,
          originalPrice: 559
        }
      },
      {
        minLicenses: 10,
        pricePerLicense: 471,
        label: '10+ licenser',
        savings: {
          percentage: 15,
          originalPrice: 559
        }
      }
    ]
  },
  
  // Yearly pricing tiers (15% discount + free microphone)
  yearly: {
    discount: 15,
    freeMicrophone: true,
    tiers: [
      {
        minLicenses: 1,
        pricePerLicense: 475,
        yearlyPrice: 5700,
        label: '1+ licenser',
        savings: {
          percentage: 15,
          originalPrice: 559
        }
      },
      {
        minLicenses: 3,
        pricePerLicense: 448,
        yearlyPrice: 5376,
        label: '3+ licenser',
        savings: {
          percentage: 15,
          originalPrice: 528
        }
      },
      {
        minLicenses: 5,
        pricePerLicense: 428,
        yearlyPrice: 5136,
        label: '5+ licenser',
        savings: {
          percentage: 15,
          originalPrice: 503
        }
      },
      {
        minLicenses: 10,
        pricePerLicense: 400,
        yearlyPrice: 4800,
        label: '10+ licenser',
        savings: {
          percentage: 15,
          originalPrice: 471
        }
      }
    ]
  },
  
  // Features included in all plans
  features: [
    'Ubegrænsede konsultationer',
    'Notatgenerering (SOAP + kort note)',
    'Automatisk transskription',
    'Henvisningsskriver',
    'Alle produktopdateringer',
    'Prioriteret support'
  ],
  
  // Additional features for yearly plans
  yearlyFeatures: [
    'Gratis mikrofon'
  ]
};

/**
 * Get pricing for a specific tier and interval
 * @param {number} minLicenses - Minimum number of licenses
 * @param {string} interval - 'monthly' or 'yearly'
 * @returns {object|null} Pricing tier object or null if not found
 */
function getPricingTier(minLicenses, interval = 'monthly') {
  const intervalConfig = pricingConfig[interval];
  if (!intervalConfig) return null;
  
  return intervalConfig.tiers.find(tier => tier.minLicenses === minLicenses) || null;
}

/**
 * Get all pricing tiers for an interval
 * @param {string} interval - 'monthly' or 'yearly'
 * @returns {array} Array of pricing tiers
 */
function getPricingTiers(interval = 'monthly') {
  const intervalConfig = pricingConfig[interval];
  if (!intervalConfig) return [];
  
  return intervalConfig.tiers || [];
}

/**
 * Calculate total price for a number of licenses
 * Tier ranges work as follows:
 * - 1-2 licenses → 1+ tier pricing
 * - 3-4 licenses → 3+ tier pricing
 * - 5-9 licenses → 5+ tier pricing
 * - 10+ licenses → 10+ tier pricing
 * 
 * @param {number} numLicenses - Number of licenses
 * @param {string} interval - 'monthly' or 'yearly'
 * @returns {object|null} Object with tier info and total price
 */
function calculatePrice(numLicenses, interval = 'monthly') {
  const intervalConfig = pricingConfig[interval];
  if (!intervalConfig) return null;
  
  // Find the appropriate tier based on number of licenses
  // Tiers are ranges: 1+ (1-2), 3+ (3-4), 5+ (5-9), 10+ (10+)
  // We find the highest tier where numLicenses >= tier.minLicenses
  const applicableTier = intervalConfig.tiers
    .slice()
    .reverse() // Start from highest tier (10+, then 5+, then 3+, then 1+)
    .find(tier => numLicenses >= tier.minLicenses);
  
  if (!applicableTier) return null;
  
  const pricePerLicense = applicableTier.pricePerLicense;
  // For yearly, calculate based on actual number of licenses, not just tier minimum
  // yearlyPrice in config is for reference (price for minimum licenses in tier)
  const totalPrice = interval === 'yearly' 
    ? pricePerLicense * numLicenses * 12
    : pricePerLicense * numLicenses;
  
  return {
    tier: applicableTier,
    numLicenses,
    pricePerLicense,
    totalPrice,
    interval
  };
}

/**
 * Get tier label from minimum licenses
 * @param {number} minLicenses - Minimum licenses for the tier
 * @returns {string} Tier label ('1+', '3+', '5+', '10+')
 */
function getTierLabel(minLicenses) {
  if (minLicenses >= 10) return '10+';
  if (minLicenses >= 5) return '5+';
  if (minLicenses >= 3) return '3+';
  return '1+';
}

/**
 * Get the maximum capacity for a tier
 * @param {number} tierMinLicenses - Minimum licenses for the tier
 * @param {number} actualCount - Actual number of users/licenses (used for 10+ tier)
 * @returns {number} Maximum licenses for the tier
 */
function getMaxLicensesForTier(tierMinLicenses, actualCount) {
  if (tierMinLicenses >= 10) return actualCount; // 10+ tier: use actual count (unlimited)
  if (tierMinLicenses >= 5) return 9; // 5+ tier: max 9 licenses
  if (tierMinLicenses >= 3) return 4; // 3+ tier: max 4 licenses
  return 2; // 1+ tier: max 2 licenses
}

module.exports = {
  pricingConfig,
  getPricingTier,
  getPricingTiers,
  calculatePrice,
  getTierLabel,
  getMaxLicensesForTier
};

