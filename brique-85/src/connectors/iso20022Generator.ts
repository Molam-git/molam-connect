/**
 * Brique 85 — Bank Connectors
 * ISO20022 PAIN.001 Generator
 *
 * Generate ISO20022 XML messages for payment initiation
 * Supports: PAIN.001 (Customer Credit Transfer Initiation)
 */

import { create, XMLBuilder } from 'xmlbuilder2';
import { PaymentRequest } from './interface';

// =====================================================================
// TYPES
// =====================================================================

export interface PAIN001Config {
  message_id: string;
  creation_date_time: string;
  initiating_party_name: string;
  initiating_party_id?: string;
  debtor_account?: {
    iban: string;
    bic?: string;
    name: string;
  };
  schema_version?: '2009' | '2019';
  batch_booking?: boolean;
}

export interface PAIN001Payment {
  end_to_end_id: string;
  amount: number;
  currency: string;
  creditor_name: string;
  creditor_iban: string;
  creditor_bic?: string;
  remittance_info?: string;
  requested_execution_date?: string;
}

// =====================================================================
// ISO20022 PAIN.001 GENERATOR
// =====================================================================

export class ISO20022Generator {
  private config: PAIN001Config;

  constructor(config: PAIN001Config) {
    this.config = {
      schema_version: '2019',
      batch_booking: true,
      ...config
    };
  }

  /**
   * Generate PAIN.001 XML from payment requests
   */
  generatePAIN001(payments: PAIN001Payment[]): string {
    const root = create({ version: '1.0', encoding: 'UTF-8' });

    // Calculate totals
    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const numberOfTransactions = payments.length;

    // Create Document root
    const doc = root.ele('Document', {
      xmlns: this.getNamespace(),
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
    });

    // Customer Credit Transfer Initiation
    const cstmrCdtTrfInitn = doc.ele('CstmrCdtTrfInitn');

    // Group Header
    this.addGroupHeader(cstmrCdtTrfInitn, numberOfTransactions, totalAmount);

    // Payment Information
    this.addPaymentInformation(cstmrCdtTrfInitn, payments, totalAmount);

    // Convert to XML string
    return root.end({ prettyPrint: true, indent: '  ' });
  }

  /**
   * Generate from PaymentRequest[]
   */
  generateFromPaymentRequests(requests: PaymentRequest[]): string {
    const payments: PAIN001Payment[] = requests.map(req => ({
      end_to_end_id: req.reference_code,
      amount: req.amount,
      currency: req.currency,
      creditor_name: req.beneficiary.account_holder_name,
      creditor_iban: req.beneficiary.iban || '',
      creditor_bic: req.beneficiary.swift_code || req.beneficiary.bic,
      remittance_info: req.remittance_info || req.description,
      requested_execution_date: req.requested_execution_date
    }));

    return this.generatePAIN001(payments);
  }

  /**
   * Add Group Header (GrpHdr)
   */
  private addGroupHeader(
    parent: any,
    numberOfTransactions: number,
    totalAmount: number
  ): void {
    const grpHdr = parent.ele('GrpHdr');

    // Message Identification
    grpHdr.ele('MsgId').txt(this.config.message_id);

    // Creation Date Time
    grpHdr.ele('CreDtTm').txt(this.config.creation_date_time);

    // Number of Transactions
    grpHdr.ele('NbOfTxs').txt(String(numberOfTransactions));

    // Control Sum (optional but recommended)
    grpHdr.ele('CtrlSum').txt(totalAmount.toFixed(2));

    // Initiating Party
    const initgPty = grpHdr.ele('InitgPty');
    initgPty.ele('Nm').txt(this.config.initiating_party_name);

    if (this.config.initiating_party_id) {
      const id = initgPty.ele('Id').ele('OrgId');
      id.ele('Othr').ele('Id').txt(this.config.initiating_party_id);
    }
  }

  /**
   * Add Payment Information (PmtInf)
   */
  private addPaymentInformation(
    parent: any,
    payments: PAIN001Payment[],
    totalAmount: number
  ): void {
    const pmtInf = parent.ele('PmtInf');

    // Payment Information Identification
    pmtInf.ele('PmtInfId').txt(`PMT-${this.config.message_id}`);

    // Payment Method
    pmtInf.ele('PmtMtd').txt('TRF'); // Credit Transfer

    // Batch Booking
    pmtInf.ele('BtchBookg').txt(this.config.batch_booking ? 'true' : 'false');

    // Number of Transactions
    pmtInf.ele('NbOfTxs').txt(String(payments.length));

    // Control Sum
    pmtInf.ele('CtrlSum').txt(totalAmount.toFixed(2));

    // Payment Type Information
    const pmtTpInf = pmtInf.ele('PmtTpInf');
    const svcLvl = pmtTpInf.ele('SvcLvl');
    svcLvl.ele('Cd').txt('SEPA'); // SEPA service level

    // Requested Execution Date
    const reqExecDate = payments[0]?.requested_execution_date ||
      new Date().toISOString().split('T')[0];
    pmtInf.ele('ReqdExctnDt').txt(reqExecDate);

    // Debtor (if configured)
    if (this.config.debtor_account) {
      this.addDebtor(pmtInf);
    }

    // Debtor Account (if configured)
    if (this.config.debtor_account) {
      const dbtrAcct = pmtInf.ele('DbtrAcct');
      const dbtrId = dbtrAcct.ele('Id');
      dbtrId.ele('IBAN').txt(this.config.debtor_account.iban);
    }

    // Debtor Agent (if BIC provided)
    if (this.config.debtor_account?.bic) {
      const dbtrAgt = pmtInf.ele('DbtrAgt');
      const finInstnId = dbtrAgt.ele('FinInstnId');
      finInstnId.ele('BIC').txt(this.config.debtor_account.bic);
    }

    // Credit Transfer Transaction Information (CdtTrfTxInf) for each payment
    for (const payment of payments) {
      this.addCreditTransferTransaction(pmtInf, payment);
    }
  }

  /**
   * Add Debtor
   */
  private addDebtor(parent: any): void {
    const dbtr = parent.ele('Dbtr');
    dbtr.ele('Nm').txt(this.config.debtor_account!.name);
  }

  /**
   * Add Credit Transfer Transaction (CdtTrfTxInf)
   */
  private addCreditTransferTransaction(
    parent: any,
    payment: PAIN001Payment
  ): void {
    const cdtTrfTxInf = parent.ele('CdtTrfTxInf');

    // Payment Identification
    const pmtId = cdtTrfTxInf.ele('PmtId');
    pmtId.ele('EndToEndId').txt(payment.end_to_end_id);

    // Amount
    const amt = cdtTrfTxInf.ele('Amt');
    const instdAmt = amt.ele('InstdAmt', { Ccy: payment.currency });
    instdAmt.txt(payment.amount.toFixed(2));

    // Creditor Agent (Bank)
    if (payment.creditor_bic) {
      const cdtrAgt = cdtTrfTxInf.ele('CdtrAgt');
      const finInstnId = cdtrAgt.ele('FinInstnId');
      finInstnId.ele('BIC').txt(payment.creditor_bic);
    }

    // Creditor (Beneficiary)
    const cdtr = cdtTrfTxInf.ele('Cdtr');
    cdtr.ele('Nm').txt(payment.creditor_name);

    // Creditor Account
    const cdtrAcct = cdtTrfTxInf.ele('CdtrAcct');
    const cdtrId = cdtrAcct.ele('Id');
    cdtrId.ele('IBAN').txt(payment.creditor_iban);

    // Remittance Information
    if (payment.remittance_info) {
      const rmtInf = cdtTrfTxInf.ele('RmtInf');
      rmtInf.ele('Ustrd').txt(payment.remittance_info);
    }
  }

  /**
   * Get XML namespace based on schema version
   */
  private getNamespace(): string {
    if (this.config.schema_version === '2009') {
      return 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03';
    }
    return 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09';
  }

  /**
   * Validate IBAN (basic check)
   */
  static validateIBAN(iban: string): boolean {
    // Remove spaces and convert to uppercase
    const clean = iban.replace(/\s/g, '').toUpperCase();

    // Check length (15-34)
    if (clean.length < 15 || clean.length > 34) {
      return false;
    }

    // Check format (2 letters + 2 digits + alphanumeric)
    const pattern = /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/;
    if (!pattern.test(clean)) {
      return false;
    }

    // TODO: Implement full IBAN validation with check digit

    return true;
  }

  /**
   * Validate BIC/SWIFT (basic check)
   */
  static validateBIC(bic: string): boolean {
    // BIC format: 4 letters (bank code) + 2 letters (country) + 2 alphanumeric (location) + optional 3 alphanumeric (branch)
    const pattern = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
    return pattern.test(bic.toUpperCase());
  }
}

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Generate PAIN.001 message from payment requests
 */
export function generatePAIN001(
  payments: PaymentRequest[],
  config: Partial<PAIN001Config>
): string {
  const fullConfig: PAIN001Config = {
    message_id: config.message_id || `MOLAM-${Date.now()}`,
    creation_date_time: config.creation_date_time || new Date().toISOString(),
    initiating_party_name: config.initiating_party_name || 'Molam Platform',
    ...config
  };

  const generator = new ISO20022Generator(fullConfig);
  return generator.generateFromPaymentRequests(payments);
}

/**
 * Sign ISO20022 XML (stub for HSM integration)
 */
export async function signXML(
  xml: string,
  hsmKeyId?: string
): Promise<string> {
  // In production, this would:
  // 1. Compute hash of XML
  // 2. Sign hash using HSM
  // 3. Attach signature to XML (XMLDSig format)

  // For now, return unsigned XML
  console.warn('XML signing not implemented - returning unsigned XML');
  return xml;
}

/**
 * Validate ISO20022 XML against schema
 */
export function validateXML(xml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic validation
  if (!xml.includes('<Document')) {
    errors.push('Missing Document root element');
  }

  if (!xml.includes('<CstmrCdtTrfInitn>')) {
    errors.push('Missing CstmrCdtTrfInitn element');
  }

  if (!xml.includes('<GrpHdr>')) {
    errors.push('Missing GrpHdr element');
  }

  // TODO: Implement full XSD schema validation

  return {
    valid: errors.length === 0,
    errors
  };
}
