declare module "mailparser" {
  export interface ParsedAddress {
    text?: string;
  }

  export interface ParsedMail {
    from?: ParsedAddress;
    to?: ParsedAddress;
    subject?: string;
    date?: Date | null;
    text?: string | null;
  }

  export function simpleParser(
    source: Buffer | string,
    options?: Record<string, unknown>
  ): Promise<ParsedMail>;
}