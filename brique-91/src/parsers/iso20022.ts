// ISO 20022 XML Statement Parser (CAMT.053)
// CAMT.053 is the standard XML format for bank-to-customer statement

import { StatementParser, ParsedStatement, ParsedStatementLine, ParserResult } from './types';

export class ISO20022Parser extends StatementParser {
  getFormat(): 'MT940' | 'ISO20022' | 'CSV' {
    return 'ISO20022';
  }

  canParse(content: string | Buffer): boolean {
    const text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
    // Check for CAMT.053 or common ISO20022 namespaces
    return text.includes('<Document') &&
           (text.includes('camt.053') || text.includes('BkToCstmrStmt'));
  }

  async parse(content: string | Buffer): Promise<ParserResult> {
    try {
      const text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;

      // Simple XML parsing (for production, use a proper XML parser like 'fast-xml-parser')
      const statement = this.parseXML(text);

      return {
        success: true,
        statement,
        warnings: []
      };
    } catch (error: any) {
      return {
        success: false,
        errors: [error.message || 'Failed to parse ISO20022 statement']
      };
    }
  }

  /**
   * Parse ISO20022 XML content
   * Note: This is a simplified implementation. For production, use a proper XML parser.
   */
  private parseXML(text: string): ParsedStatement {
    // Extract statement identification
    const statement_id = this.extractTag(text, 'Id') || `ISO20022-${Date.now()}`;

    // Extract account information
    const account_iban = this.extractTag(text, 'IBAN') || '';
    const account_number = account_iban || this.extractTag(text, 'Othr', 'Id') || '';

    // Extract balances
    const openingBalance = this.parseBalance(text, 'OPBD'); // Opening Booked
    const closingBalance = this.parseBalance(text, 'CLBD'); // Closing Booked

    // Extract currency
    const currency = this.extractTag(text, 'Ccy') || 'EUR';

    // Extract date range
    const fromDateStr = this.extractTag(text, 'FrDtTm') || this.extractTag(text, 'CreDtTm');
    const toDateStr = this.extractTag(text, 'ToDtTm') || fromDateStr;

    const from_date = fromDateStr ? new Date(fromDateStr) : new Date();
    const to_date = toDateStr ? new Date(toDateStr) : new Date();

    // Extract entries (transactions)
    const lines = this.parseEntries(text);

    return {
      statement_id,
      account_number,
      account_iban,
      currency,
      from_date,
      to_date,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      lines,
      format: 'ISO20022',
      raw_metadata: {
        message_id: this.extractTag(text, 'MsgId'),
        creation_date: this.extractTag(text, 'CreDtTm')
      }
    };
  }

  /**
   * Parse balance from XML
   */
  private parseBalance(text: string, balanceType: string): number {
    // Find balance block with matching Tp/CdOrPrtry/Cd
    const regex = new RegExp(`<Bal>[\\s\\S]*?<Tp>[\\s\\S]*?<Cd>${balanceType}</Cd>[\\s\\S]*?<Amt[^>]*>([\\d.,-]+)</Amt>[\\s\\S]*?<CdtDbtInd>(CRDT|DBIT)</CdtDbtInd>[\\s\\S]*?</Bal>`, 'i');
    const match = text.match(regex);

    if (!match) {
      return 0;
    }

    const amount = parseFloat(match[1].replace(',', '.'));
    const indicator = match[2];

    return indicator === 'DBIT' ? -amount : amount;
  }

  /**
   * Parse transaction entries
   */
  private parseEntries(text: string): ParsedStatementLine[] {
    const lines: ParsedStatementLine[] = [];

    // Find all <Ntry> (Entry) blocks
    const entryRegex = /<Ntry>([\s\S]*?)<\/Ntry>/g;
    let match;

    while ((match = entryRegex.exec(text)) !== null) {
      const entryXML = match[1];

      try {
        const line = this.parseEntry(entryXML);
        if (line) {
          lines.push(line);
        }
      } catch (error) {
        console.error('Error parsing ISO20022 entry:', error);
      }
    }

    return lines;
  }

  /**
   * Parse a single entry (transaction)
   */
  private parseEntry(entryXML: string): ParsedStatementLine | null {
    // Extract amount
    const amountStr = this.extractTag(entryXML, 'Amt');
    if (!amountStr) return null;

    const amount = parseFloat(amountStr.replace(',', '.'));

    // Extract credit/debit indicator
    const cdIndicator = this.extractTag(entryXML, 'CdtDbtInd');
    const direction = cdIndicator === 'DBIT' ? 'debit' : 'credit';

    // Extract dates
    const valueDateStr = this.extractTag(entryXML, 'ValDt', 'Dt') || this.extractTag(entryXML, 'BookgDt', 'Dt');
    const value_date = valueDateStr ? new Date(valueDateStr) : new Date();

    const postingDateStr = this.extractTag(entryXML, 'BookgDt', 'Dt');
    const posting_date = postingDateStr ? new Date(postingDateStr) : undefined;

    // Extract references
    const reference = this.extractTag(entryXML, 'AcctSvcrRef') || this.extractTag(entryXML, 'EndToEndId');
    const bank_reference = this.extractTag(entryXML, 'AcctSvcrRef');

    // Extract counterparty information
    const counterparty_name = this.extractTag(entryXML, 'RltdPties', 'Nm') ||
                               this.extractTag(entryXML, 'Dbtr', 'Nm') ||
                               this.extractTag(entryXML, 'Cdtr', 'Nm');

    const counterparty_iban = this.extractTag(entryXML, 'RltdPties', 'IBAN') ||
                               this.extractTag(entryXML, 'DbtrAcct', 'IBAN') ||
                               this.extractTag(entryXML, 'CdtrAcct', 'IBAN');

    const counterparty_bic = this.extractTag(entryXML, 'RltdAgts', 'BIC') ||
                              this.extractTag(entryXML, 'DbtrAgt', 'BIC') ||
                              this.extractTag(entryXML, 'CdtrAgt', 'BIC');

    // Extract remittance information (description)
    const description = this.extractTag(entryXML, 'AddtlNtryInf') ||
                        this.extractTag(entryXML, 'RmtInf', 'Ustrd') ||
                        this.extractTag(entryXML, 'Nm');

    // Extract transaction type
    const transaction_type = this.extractTag(entryXML, 'BkTxCd', 'Prtry', 'Cd') ||
                              this.extractTag(entryXML, 'BkTxCd', 'Domn', 'Cd');

    return {
      value_date,
      posting_date,
      amount,
      currency: this.extractTag(entryXML, 'Amt', 'Ccy') || 'EUR',
      direction,
      reference,
      bank_reference,
      counterparty_name,
      counterparty_iban,
      counterparty_bic,
      description,
      transaction_type,
      additional_info: {
        entry_reference: this.extractTag(entryXML, 'NtryRef'),
        additional_info: this.extractTag(entryXML, 'AddtlNtryInf')
      }
    };
  }

  /**
   * Extract value from XML tag
   * Supports nested tags like extractTag(xml, 'Parent', 'Child')
   */
  private extractTag(xml: string, ...tags: string[]): string | undefined {
    let current = xml;

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const isLastTag = i === tags.length - 1;

      if (isLastTag) {
        // Extract value from final tag
        const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i');
        const match = current.match(regex);
        return match ? match[1].trim() : undefined;
      } else {
        // Navigate to nested tag
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
        const match = current.match(regex);
        if (!match) return undefined;
        current = match[1];
      }
    }

    return undefined;
  }
}
