const axios = require('axios');

/**
 * Corti AI Service
 * Handles all interactions with the Corti.AI API
 * Based on the corati.ai implementation
 */

class CortiService {
  constructor() {
    this.environment = process.env.CORTI_ENVIRONMENT || 'eu';
    this.tenantName = process.env.CORTI_TENANT_NAME || 'base';
    this.clientId = process.env.CORTI_CLIENT_ID;
    this.clientSecret = process.env.CORTI_CLIENT_SECRET;
    
    // API URLs
    this.tokenUrl = `https://auth.${this.environment}.corti.app/realms/${this.tenantName}/protocol/openid-connect/token`;
    this.apiBaseUrl = `https://api.${this.environment}.corti.app/v2`;
    
    // Cache for access token
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get access token from Corti API
   * Implements token caching to avoid unnecessary requests
   */
  async getAccessToken() {
    try {
      // Return cached token if still valid
      if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.accessToken;
      }

      const response = await axios.post(this.tokenUrl, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        scope: 'openid'
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.status !== 200) {
        throw new Error(`Token request failed with status ${response.status}`);
      }

      const { access_token, expires_in } = response.data;
      
      // Cache the token
      this.accessToken = access_token;
      this.tokenExpiry = new Date(Date.now() + (expires_in - 60) * 1000); // Expire 1 minute early
      
      return access_token;
    } catch (error) {
      throw new Error(`Failed to get Corti access token: ${error.message}`);
    }
  }

  /**
   * Create a new interaction (recording session)
   * Returns interaction data including WebSocket URL
   */
  async createInteraction(userId, patientData = {}) {
    try {
      const token = await this.getAccessToken();
      
      const interactionData = {
        assignedUserId: "3c90c3cc-0d44-4b50-8888-8dd25736052a", // Corti user ID
        encounter: {
          identifier: `${Date.now()}-carenote-encounter`,
          status: "planned",
          type: "first_consultation",
          period: {
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString()
          },
          title: "CareNote Recording Session"
        },
        patient: {
          identifier: patientData.identifier || `${Date.now()}-patient`,
          name: "Patient",
          gender: "unknown",
          birthDate: "1990-01-01T00:00:00Z",
          pronouns: "they/them"
        }
      };

      const response = await axios.post(`${this.apiBaseUrl}/interactions/`, interactionData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Tenant-Name': this.tenantName
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to create Corti interaction: ${error.message}`);
    }
  }

  /**
   * Get facts from an interaction
   */
  async getFacts(interactionId) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.apiBaseUrl}/interactions/${interactionId}/facts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Tenant-Name': this.tenantName
        }
      });

      if (response.status !== 200) {
        throw new Error(`Failed to get facts: ${response.status}`);
      }

      // Filter out discarded facts
      const facts = response.data.facts || [];
      return facts.filter(fact => !fact.isDiscarded);
    } catch (error) {
      throw new Error(`Failed to get facts from Corti: ${error.message}`);
    }
  }

  /**
   * Add a new fact to an interaction
   */
  async addFact(interactionId, factData) {
    try {
      const token = await this.getAccessToken();
      
      const payload = {
        facts: [{
          text: factData.text,
          group: factData.group,
          source: factData.source || "user"
        }]
      };

      const response = await axios.post(`${this.apiBaseUrl}/interactions/${interactionId}/facts/`, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Tenant-Name': this.tenantName
        }
      });

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Failed to add fact: ${response.status}`);
      }

      return response.data;
    } catch (error) {
      throw new Error(`Failed to add fact to Corti: ${error.message}`);
    }
  }

  /**
   * Update an existing fact
   */
  async updateFact(interactionId, factId, updateData) {
    try {
      const token = await this.getAccessToken();
      
      const payload = {
        text: updateData.text,
        group: updateData.group,
        isDiscarded: updateData.isDiscarded || false
      };

      const response = await axios.patch(`${this.apiBaseUrl}/interactions/${interactionId}/facts/${factId}`, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Tenant-Name': this.tenantName
        }
      });

      if (response.status !== 200) {
        throw new Error(`Failed to update fact: ${response.status}`);
      }

      return response.data;
    } catch (error) {
      throw new Error(`Failed to update fact in Corti: ${error.message}`);
    }
  }

  /**
   * Discard (soft delete) a fact
   */
  async discardFact(interactionId, factId) {
    try {
      return await this.updateFact(interactionId, factId, { isDiscarded: true });
    } catch (error) {
      throw new Error(`Failed to discard fact in Corti: ${error.message}`);
    }
  }

  /**
   * Generate template from interaction facts
   */
  async generateTemplate(interactionId, templateType = 'brief-clinical-note', outputLanguage) {
    try {
      const token = await this.getAccessToken();
      
      // Get current facts from interaction
      const facts = await this.getFacts(interactionId);
      
      // Prepare template generation request
      let templateKey, templateName;
      if (templateType === 'soap') {
        templateKey = 'corti-soap';
        templateName = 'SOAP Note';
      } else if (templateType === 'nursing-note') {
        templateKey = 'corti-nursing-note';
        templateName = 'Nursing Note';
      } else {
        templateKey = 'corti-brief-clinical-note';
        templateName = 'Brief Clinical Note';
      }
      
      const payload = {
        context: [{
          type: 'facts',
          data: facts
        }],
        templateKey,
        name: templateName,
        outputLanguage
      };

      const response = await axios.post(`${this.apiBaseUrl}/interactions/${interactionId}/documents/`, payload, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Tenant-Name': this.tenantName
        }
      });

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Failed to generate template: ${response.status}`);
      }

      const templateData = response.data;
      
      // Format the template content
      let formattedContent = '';
      if (templateType === 'soap' || templateType === 'nursing-note') {
        // Format SOAP note and Nursing note sections (both have multiple sections)
        formattedContent = templateData.sections
          .sort((a, b) => a.sort - b.sort)
          .map(section => `${section.name}:\n${section.text}`)
          .join('\n\n');
      } else {
        // Format Brief Clinical Note
        formattedContent = templateData.sections[0]?.text || '';
      }

      return {
        content: formattedContent,
        templateKey,
        templateType,
        facts: facts,
        rawData: templateData
      };
    } catch (error) {
      throw new Error(`Failed to generate template from Corti: ${error.message}`);
    }
  }

  /**
   * Get available fact groups
   */
  async getFactGroups() {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.apiBaseUrl}/factgroups/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Tenant-Name': this.tenantName
        }
      });

      if (response.status === 200 && response.data?.data) {
        return response.data.data;
      }
      
      // Fallback to hardcoded groups if API fails
      return this.getFallbackFactGroups();
    } catch (error) {
      console.warn('Failed to get fact groups from Corti API, using fallback');
      return this.getFallbackFactGroups();
    }
  }

  /**
   * Fallback fact groups if API is unavailable
   */
  getFallbackFactGroups() {
    return [
      { key: 'symptoms', name: 'Symptoms' },
      { key: 'diagnosis', name: 'Diagnosis' },
      { key: 'medications', name: 'Medications' },
      { key: 'allergies', name: 'Allergies' },
      { key: 'vitals', name: 'Vital Signs' },
      { key: 'procedures', name: 'Procedures' },
      { key: 'family-history', name: 'Family History' },
      { key: 'social-history', name: 'Social History' },
      { key: 'physical-exam', name: 'Physical Exam' },
      { key: 'lab-results', name: 'Lab Results' },
      { key: 'imaging', name: 'Imaging' },
      { key: 'treatment-plan', name: 'Treatment Plan' },
      { key: 'other', name: 'Other' }
    ];
  }

  /**
   * Generate title for template based on content
   */
  async generateTitle(content, specialty = 'general') {
    try {
      // Use the content to generate a brief title
      // This is a simple implementation - could be enhanced with AI
      const lines = content.split('\n').filter(line => line.trim());
      const firstLine = lines[0] || 'Clinical Note';
      
      // Extract meaningful title from first line or create one
      if (firstLine.length > 50) {
        return `${specialty.charAt(0).toUpperCase() + specialty.slice(1)} Note - ${new Date().toLocaleDateString()}`;
      }
      
      return firstLine.length > 5 ? firstLine : `Clinical Note - ${new Date().toLocaleDateString()}`;
    } catch (error) {
      return `Clinical Note - ${new Date().toLocaleDateString()}`;
    }
  }

  /**
   * List transcripts for an interaction
   * GET /interactions/{id}/transcripts/
   * @param {string} interactionId - The Corti interaction ID
   * @param {boolean} full - Whether to return full transcripts in listing
   * @returns {Promise<Object>} List of transcripts
   */
  async listTranscripts(interactionId, full = false) {
    try {
      const token = await this.getAccessToken();
      
      // https://docs.corti.ai/api-reference/transcripts/list-transcripts
      const url = `${this.apiBaseUrl}/interactions/${interactionId}/transcripts/${full ? '?full=true' : ''}`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Tenant-Name': this.tenantName
        }
      });

      if (response.status !== 200) {
        throw new Error(`Failed to list transcripts: ${response.status}`);
      }

      console.log('Transcripts:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list transcripts from Corti: ${error.message}`);
    }
  }

}

module.exports = new CortiService(); 