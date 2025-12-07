/**
 * Unified Pricing Configuration
 * Single source of truth for all pricing information
 * All prices are in DKK and exclude VAT (moms)
 */

const pricingConfig = {
  currency: 'DKK',
  vatIncluded: false,
  vatRate: 0.25, // 25% VAT for Denmark (not calculated, just for reference)
  trialDays: 15, // Free trial period in days
  
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
 * @param {number} numLicenses - Number of licenses
 * @param {string} interval - 'monthly' or 'yearly'
 * @returns {object|null} Object with tier info and total price
 */
function calculatePrice(numLicenses, interval = 'monthly') {
  const intervalConfig = pricingConfig[interval];
  if (!intervalConfig) return null;
  
  // Find the appropriate tier based on number of licenses
  const applicableTier = intervalConfig.tiers
    .slice()
    .reverse() // Start from highest tier
    .find(tier => numLicenses >= tier.minLicenses);
  
  if (!applicableTier) return null;
  
  const pricePerLicense = applicableTier.pricePerLicense;
  const totalPrice = interval === 'yearly' 
    ? applicableTier.yearlyPrice 
    : pricePerLicense * numLicenses;
  
  return {
    tier: applicableTier,
    numLicenses,
    pricePerLicense,
    totalPrice,
    interval
  };
}

module.exports = {
  pricingConfig,
  getPricingTier,
  getPricingTiers,
  calculatePrice
};

