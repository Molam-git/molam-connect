/**
 * Brique 107 - USSD Service
 *
 * USSD session management with Finite State Machine
 * Supports multi-country, multi-language menus
 */

const crypto = require('crypto');

class USSDService {
  constructor(pool, config = {}) {
    this.pool = pool;
    this.maxPinAttempts = config.maxPinAttempts || 3;
    this.pinLockDuration = config.pinLockDuration || 30; // minutes
    this.sessionTimeout = config.sessionTimeout || 300; // seconds
  }

  /**
   * Handle incoming USSD request
   */
  async handleUSSD({ sessionId, msisdn, text, countryCode = 'SN' }) {
    // Clean phone number
    const phone = this.normalizePhone(msisdn);

    // Get or create session
    let session = await this.getOrCreateSession(sessionId, phone, countryCode);

    // Check session timeout
    if (this.isSessionExpired(session)) {
      await this.endSession(sessionId);
      return this.renderMenu('main_menu', session, {}, true);
    }

    // Parse user input
    const input = text ? text.trim() : '';
    const inputParts = input.split('*');
    const lastInput = inputParts[inputParts.length - 1];

    // FSM - Route based on current state
    let response;

    switch (session.state) {
      case 'menu':
        response = await this.handleMainMenu(session, lastInput);
        break;

      case 'awaiting_pin':
        response = await this.handlePinEntry(session, lastInput);
        break;

      case 'balance':
        response = await this.handleBalance(session);
        break;

      case 'transfer_recipient':
        response = await this.handleTransferRecipient(session, lastInput);
        break;

      case 'transfer_amount':
        response = await this.handleTransferAmount(session, lastInput);
        break;

      case 'transfer_confirm':
        response = await this.handleTransferConfirm(session, lastInput);
        break;

      case 'recharge_amount':
        response = await this.handleRechargeAmount(session, lastInput);
        break;

      case 'withdrawal_amount':
        response = await this.handleWithdrawalAmount(session, lastInput);
        break;

      case 'pin_reset_new':
        response = await this.handlePinResetNew(session, lastInput);
        break;

      case 'pin_reset_confirm':
        response = await this.handlePinResetConfirm(session, lastInput);
        break;

      default:
        response = await this.renderMenu('main_menu', session, {}, true);
    }

    // Update session
    await this.updateSession(session);

    // Record metric
    await this.recordMetric('ussd_session', countryCode, 'ussd', 1);

    return response;
  }

  /**
   * Handle main menu selection
   */
  async handleMainMenu(session, input) {
    switch (input) {
      case '1': // Balance
        session.state = 'awaiting_pin';
        session.data.next_action = 'balance';
        return {
          text: await this.getMenuText(session, 'pin_prompt'),
          end: false
        };

      case '2': // Recharge
        session.state = 'recharge_amount';
        return {
          text: await this.getMenuText(session, 'recharge_amount_prompt', {
            prompt: 'Entrez le montant à recharger:'
          }),
          end: false
        };

      case '3': // Transfer
        session.state = 'awaiting_pin';
        session.data.next_action = 'transfer';
        return {
          text: await this.getMenuText(session, 'pin_prompt'),
          end: false
        };

      case '4': // Withdrawal
        session.state = 'awaiting_pin';
        session.data.next_action = 'withdrawal';
        return {
          text: await this.getMenuText(session, 'pin_prompt'),
          end: false
        };

      case '99': // Reset PIN
        session.state = 'pin_reset_new';
        return {
          text: 'Entrez votre nouveau PIN (4 chiffres):',
          end: false
        };

      default:
        return await this.renderMenu('main_menu', session, {}, true);
    }
  }

  /**
   * Handle PIN entry
   */
  async handlePinEntry(session, pin) {
    // Verify PIN
    const isValid = await this.verifyPIN(session.phone, pin);

    if (!isValid) {
      session.pin_attempts++;

      if (session.pin_attempts >= this.maxPinAttempts) {
        session.pin_locked_until = new Date(Date.now() + this.pinLockDuration * 60 * 1000);
        const minutes = this.pinLockDuration;

        return {
          text: await this.getMenuText(session, 'pin_locked', { minutes }),
          end: true
        };
      }

      const attemptsLeft = this.maxPinAttempts - session.pin_attempts;
      return {
        text: await this.getMenuText(session, 'pin_invalid', { attempts: attemptsLeft }),
        end: false
      };
    }

    // PIN valid - proceed with next action
    session.pin_attempts = 0;
    const nextAction = session.data.next_action;

    switch (nextAction) {
      case 'balance':
        return await this.handleBalance(session);

      case 'transfer':
        session.state = 'transfer_recipient';
        return {
          text: await this.getMenuText(session, 'transfer_recipient'),
          end: false
        };

      case 'withdrawal':
        session.state = 'withdrawal_amount';
        return {
          text: 'Entrez le montant à retirer:',
          end: false
        };

      default:
        return await this.renderMenu('main_menu', session, {}, true);
    }
  }

  /**
   * Handle balance inquiry
   */
  async handleBalance(session) {
    // Fetch user balance (mock for now)
    const balance = await this.getUserBalance(session.phone);

    const text = await this.getMenuText(session, 'balance_prompt', {
      balance: balance.toFixed(2),
      currency: 'XOF'
    });

    return { text, end: true };
  }

  /**
   * Handle transfer recipient entry
   */
  async handleTransferRecipient(session, recipient) {
    // Validate phone number
    if (!this.isValidPhone(recipient)) {
      return {
        text: 'Numero invalide. Veuillez reessayer:',
        end: false
      };
    }

    session.data.transfer_recipient = recipient;
    session.state = 'transfer_amount';

    return {
      text: await this.getMenuText(session, 'transfer_amount'),
      end: false
    };
  }

  /**
   * Handle transfer amount entry
   */
  async handleTransferAmount(session, amount) {
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return {
        text: 'Montant invalide. Veuillez reessayer:',
        end: false
      };
    }

    session.data.transfer_amount = parsedAmount;
    session.state = 'transfer_confirm';

    const text = await this.getMenuText(session, 'transfer_confirm', {
      amount: parsedAmount,
      currency: 'XOF',
      recipient: session.data.transfer_recipient
    });

    return { text, end: false };
  }

  /**
   * Handle transfer confirmation
   */
  async handleTransferConfirm(session, confirm) {
    if (confirm !== '1') {
      return await this.renderMenu('main_menu', session, {}, true);
    }

    // Process transfer
    const result = await this.processTransfer({
      from: session.phone,
      to: session.data.transfer_recipient,
      amount: session.data.transfer_amount,
      currency: 'XOF'
    });

    // Record transaction
    await this.recordTransaction(session.id, 'transfer', session.data.transfer_amount, result.status);

    // Record metric
    await this.recordMetric('ussd_transaction', session.country_code, 'ussd', session.data.transfer_amount);

    const text = result.success
      ? await this.getMenuText(session, 'success_message')
      : await this.getMenuText(session, 'error_message', { error: result.error });

    return { text, end: true };
  }

  /**
   * Handle recharge amount
   */
  async handleRechargeAmount(session, amount) {
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return {
        text: 'Montant invalide. Veuillez reessayer:',
        end: false
      };
    }

    // Process recharge (mock)
    const result = { success: true };

    await this.recordTransaction(session.id, 'recharge', parsedAmount, 'completed');

    const text = result.success
      ? `Recharge de ${parsedAmount} XOF effectuee avec succes!`
      : 'Erreur lors de la recharge.';

    return { text, end: true };
  }

  /**
   * Handle withdrawal amount
   */
  async handleWithdrawalAmount(session, amount) {
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return {
        text: 'Montant invalide. Veuillez reessayer:',
        end: false
      };
    }

    // Check balance
    const balance = await this.getUserBalance(session.phone);

    if (parsedAmount > balance) {
      return {
        text: 'Solde insuffisant.',
        end: true
      };
    }

    // Process withdrawal (mock)
    const result = { success: true };

    await this.recordTransaction(session.id, 'withdrawal', parsedAmount, 'completed');

    const text = result.success
      ? `Retrait de ${parsedAmount} XOF effectue. Rendez-vous chez un agent.`
      : 'Erreur lors du retrait.';

    return { text, end: true };
  }

  /**
   * Handle PIN reset - new PIN entry
   */
  async handlePinResetNew(session, newPin) {
    if (!/^\d{4}$/.test(newPin)) {
      return {
        text: 'PIN invalide. Utilisez 4 chiffres:',
        end: false
      };
    }

    session.data.new_pin = newPin;
    session.state = 'pin_reset_confirm';

    return {
      text: 'Confirmez votre nouveau PIN:',
      end: false
    };
  }

  /**
   * Handle PIN reset - confirm
   */
  async handlePinResetConfirm(session, confirmPin) {
    if (confirmPin !== session.data.new_pin) {
      return {
        text: 'Les PINs ne correspondent pas. Operation annulee.',
        end: true
      };
    }

    // Update PIN
    await this.updatePIN(session.phone, session.data.new_pin);

    await this.recordTransaction(session.id, 'pin_reset', 0, 'completed');

    return {
      text: 'Votre PIN a ete modifie avec succes!',
      end: true
    };
  }

  /**
   * Get or create USSD session
   */
  async getOrCreateSession(sessionId, phone, countryCode) {
    let result = await this.pool.query(
      `SELECT * FROM ussd_sessions WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Create new session
    result = await this.pool.query(
      `INSERT INTO ussd_sessions (session_id, phone, country_code, state, data)
       VALUES ($1, $2, $3, 'menu', '{}')
       RETURNING *`,
      [sessionId, phone, countryCode]
    );

    return result.rows[0];
  }

  /**
   * Update USSD session
   */
  async updateSession(session) {
    await this.pool.query(
      `UPDATE ussd_sessions
       SET state = $2, data = $3, pin_attempts = $4, pin_locked_until = $5,
           last_interaction = now(), updated_at = now()
       WHERE id = $1`,
      [session.id, session.state, session.data, session.pin_attempts, session.pin_locked_until]
    );
  }

  /**
   * End USSD session
   */
  async endSession(sessionId) {
    await this.pool.query(
      `DELETE FROM ussd_sessions WHERE session_id = $1`,
      [sessionId]
    );
  }

  /**
   * Get menu text
   */
  async getMenuText(session, menuKey, variables = {}) {
    const result = await this.pool.query(
      `SELECT text_content FROM ussd_menu_texts
       WHERE country_code = $1 AND language = $2 AND menu_key = $3 AND is_active = true`,
      [session.country_code, session.language, menuKey]
    );

    if (result.rows.length === 0) {
      return `Menu text not found: ${menuKey}`;
    }

    let text = result.rows[0].text_content;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      text = text.replace(`{${key}}`, value);
    }

    return text;
  }

  /**
   * Render menu
   */
  async renderMenu(menuKey, session, variables = {}, resetState = false) {
    if (resetState) {
      session.state = 'menu';
      session.data = {};
    }

    return {
      text: await this.getMenuText(session, menuKey, variables),
      end: false
    };
  }

  /**
   * Verify PIN (Argon2 hash check - simplified for demo)
   */
  async verifyPIN(phone, pin) {
    // In production: Use Argon2 to verify
    // For demo: Accept any 4-digit PIN
    return /^\d{4}$/.test(pin);
  }

  /**
   * Update PIN
   */
  async updatePIN(phone, newPin) {
    // In production: Hash with Argon2
    const pinHash = crypto.createHash('sha256').update(newPin).digest('hex');
    const salt = crypto.randomBytes(16).toString('hex');

    await this.pool.query(
      `INSERT INTO ussd_pins (phone, pin_hash, salt)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE
       SET pin_hash = $2, salt = $3, failed_attempts = 0, locked_until = NULL, last_changed = now()`,
      [phone, pinHash, salt]
    );
  }

  /**
   * Get user balance (mock)
   */
  async getUserBalance(phone) {
    // Mock balance for demo
    return Math.floor(Math.random() * 100000) + 10000;
  }

  /**
   * Process transfer (mock)
   */
  async processTransfer({ from, to, amount, currency }) {
    // Mock transfer
    return { success: true };
  }

  /**
   * Record transaction
   */
  async recordTransaction(sessionId, type, amount, status) {
    try {
      await this.pool.query(
        `INSERT INTO ussd_transactions (session_id, phone, type, amount, status, completed_at)
         SELECT $1, phone, $2, $3, $4, now()
         FROM ussd_sessions WHERE id = $1`,
        [sessionId, type, amount, status]
      );
    } catch (error) {
      console.error('Failed to record transaction:', error);
    }
  }

  /**
   * Record metric
   */
  async recordMetric(metricType, countryCode, channel, value) {
    try {
      await this.pool.query(
        `INSERT INTO offline_metrics (metric_type, country_code, channel, value)
         VALUES ($1, $2, $3, $4)`,
        [metricType, countryCode, channel, value]
      );
    } catch (error) {
      console.error('Failed to record metric:', error);
    }
  }

  /**
   * Normalize phone number
   */
  normalizePhone(phone) {
    return phone.replace(/[^\d+]/g, '');
  }

  /**
   * Validate phone number
   */
  isValidPhone(phone) {
    return /^(\+221)?\d{9}$/.test(phone);
  }

  /**
   * Check if session expired
   */
  isSessionExpired(session) {
    const lastInteraction = new Date(session.last_interaction);
    const now = new Date();
    return (now - lastInteraction) / 1000 > this.sessionTimeout;
  }
}

module.exports = USSDService;
