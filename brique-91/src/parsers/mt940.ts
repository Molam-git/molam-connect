// MT940 Statement Parser
// SWIFT MT940 is a standard format for electronic transmission of account statements

import { StatementParser, ParsedStatement, ParsedStatementLine, ParserResult } from './types';

interface MT940Block {
  tag: string;
  value: string;
}

export class MT940Parser extends StatementParser {
  getFormat(): 'MT940' | 'ISO20022' | 'CSV' {
    return 'MT940';
  }

  canParse(content: string | Buffer): boolean {
    const text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
    // MT940 files typically start with :20: (Transaction Reference) or have multiple :XX: tags
    return /^:20:|:25:|:60F:/.test(text.trim());
  }

  async parse(content: string | Buffer): Promise<ParserResult> {
    try {
      const text = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
      const blocks = this.parseBlocks(text);

      if (blocks.length === 0) {
        return {
          success: false,
          errors: ['No valid MT940 blocks found']
        };
      }

      const statement = this.buildStatement(blocks);

      return {
        success: true,
        statement,
        warnings: []
      };
    } catch (error: any) {
      return {
        success: false,
        errors: [error.message || 'Failed to parse MT940 statement']
      };
    }
  }

  /**
   * Parse MT940 content into blocks (each :XX: tag)
   */
  private parseBlocks(text: string): MT940Block[] {
    const blocks: MT940Block[] = [];

    // Split by lines and process
    const lines = text.split(/\r?\n/);
    let currentTag = '';
    let currentValue = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if this line starts with a tag (e.g., :20:, :25:, :60F:)
      const tagMatch = trimmed.match(/^:(\w+):(.*)/);

      if (tagMatch) {
        // Save previous block if exists
        if (currentTag) {
          blocks.push({ tag: currentTag, value: currentValue.trim() });
        }

        currentTag = tagMatch[1];
        currentValue = tagMatch[2];
      } else if (currentTag) {
        // Continuation of previous tag
        currentValue += '\n' + trimmed;
      }
    }

    // Save last block
    if (currentTag) {
      blocks.push({ tag: currentTag, value: currentValue.trim() });
    }

    return blocks;
  }

  /**
   * Build structured statement from blocks
   */
  private buildStatement(blocks: MT940Block[]): ParsedStatement {
    // Extract key fields
    const statement_id = this.getBlockValue(blocks, '20') || `MT940-${Date.now()}`;
    const accountInfo = this.getBlockValue(blocks, '25') || '';
    const openingBalance = this.parseBalance(this.getBlockValue(blocks, '60F') || '');
    const closingBalance = this.parseBalance(this.getBlockValue(blocks, '62F') || '');

    // Parse account number (format: BANKCODE/ACCOUNTNUMBER or just ACCOUNTNUMBER)
    const accountParts = accountInfo.split('/');
    const account_number = accountParts.length > 1 ? accountParts[1] : accountInfo;

    // Extract transactions (tag :61:)
    const transactionBlocks = blocks.filter(b => b.tag === '61');
    const lines = transactionBlocks.map((block, idx) => this.parseTransaction(block, blocks, idx));

    return {
      statement_id,
      account_number,
      currency: openingBalance.currency,
      from_date: openingBalance.date,
      to_date: closingBalance.date,
      opening_balance: openingBalance.amount,
      closing_balance: closingBalance.amount,
      lines: lines.filter(l => l !== null) as ParsedStatementLine[],
      format: 'MT940',
      raw_metadata: {
        sender_reference: this.getBlockValue(blocks, '20'),
        account_id: this.getBlockValue(blocks, '25'),
        statement_number: this.getBlockValue(blocks, '28C')
      }
    };
  }

  /**
   * Parse balance line (:60F: or :62F:)
   * Format: CDYYMMDDCCYAmount
   * C = Credit/Debit indicator
   * YYMMDD = Date
   * CCY = Currency code (3 letters)
   * Amount = Balance amount
   */
  private parseBalance(value: string): { date: Date; currency: string; amount: number } {
    // Example: C231215EUR123456,78
    const match = value.match(/^([CD])(\d{6})([A-Z]{3})([\d,\.]+)$/);

    if (!match) {
      return { date: new Date(), currency: 'EUR', amount: 0 };
    }

    const [, indicator, dateStr, currency, amountStr] = match;

    // Parse date (YYMMDD)
    const year = 2000 + parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4)) - 1; // JS months are 0-indexed
    const day = parseInt(dateStr.substring(4, 6));
    const date = new Date(year, month, day);

    // Parse amount (replace comma with dot for decimal)
    const amount = parseFloat(amountStr.replace(',', '.')) * (indicator === 'D' ? -1 : 1);

    return { date, currency, amount };
  }

  /**
   * Parse transaction line (:61:)
   * Format: YYMMDDCDAmount[Additional info]
   */
  private parseTransaction(block: MT940Block, allBlocks: MT940Block[], index: number): ParsedStatementLine | null {
    try {
      const value = block.value;

      // Basic format: YYMMDD[MMDD]CDAmount[Transaction type][Reference]
      // Example: 2312150101DR123,45NTRFNONREF//INVOICE123
      const match = value.match(/^(\d{6})(\d{4})?([CD])([DR]?)([\d,\.]+)([A-Z]{4})?(.*)$/);

      if (!match) {
        console.warn('Failed to parse MT940 transaction:', value);
        return null;
      }

      const [, valueDateStr, postingDateStr, cdIndicator, drIndicator, amountStr, txnType, additional] = match;

      // Parse value date
      const year = 2000 + parseInt(valueDateStr.substring(0, 2));
      const month = parseInt(valueDateStr.substring(2, 4)) - 1;
      const day = parseInt(valueDateStr.substring(4, 6));
      const value_date = new Date(year, month, day);

      // Parse amount
      const amount = Math.abs(parseFloat(amountStr.replace(',', '.')));
      const direction = (cdIndicator === 'D' || drIndicator === 'D') ? 'debit' : 'credit';

      // Get description from :86: tag (next block after :61:)
      const descriptionBlock = allBlocks.find((b, idx) =>
        b.tag === '86' && idx > allBlocks.indexOf(block) && idx <= allBlocks.indexOf(block) + 1
      );

      const description = descriptionBlock?.value || '';

      // Extract reference from additional info
      const refMatch = additional.match(/\/\/(.+)/);
      const reference = refMatch ? refMatch[1] : undefined;

      return {
        value_date,
        amount,
        currency: 'EUR', // Will be inherited from statement
        direction,
        reference,
        transaction_type: txnType || undefined,
        description: description || additional,
        additional_info: {
          raw_line: value,
          cd_indicator: cdIndicator,
          dr_indicator: drIndicator
        }
      };
    } catch (error) {
      console.error('Error parsing MT940 transaction:', error);
      return null;
    }
  }

  /**
   * Get value for a specific block tag
   */
  private getBlockValue(blocks: MT940Block[], tag: string): string | undefined {
    return blocks.find(b => b.tag === tag)?.value;
  }
}
