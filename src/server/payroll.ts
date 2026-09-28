import "server-only";
import { AppError } from "./errors";

/** Employer-issued Form 16 is distinct from ERI prefill. Never request employee passwords.
 * Implement one connector per authorized employer API and OAuth consent contract.
 * No built-in connector pretends to have universal central/state/PSU access.
 */
export interface PayrollConnector {
  readonly id:string;
  readonly employerCategory:"central"|"state"|"psu";
  beginConsent(input:{userId:string;redirectUri:string;state:string;pkceChallenge:string}):Promise<{authorizationUrl:string}>;
  completeConsent(input:{code:string;state:string;pkceVerifier:string}):Promise<{connectionId:string;expiresAt:string}>;
  listSalaryDocuments(input:{connectionId:string;financialYear:"2025-26"}):Promise<{id:string;kind:"form16"|"salary_statement";issuer:string;period:string}[]>;
  fetchDocument(input:{connectionId:string;documentId:string}):Promise<{bytes:Uint8Array;mime:"application/pdf";issuer:string;officiallyIssued:true}>;
  revoke(connectionId:string):Promise<void>;
}
const connectors=new Map<string,PayrollConnector>();
export function registerPayrollConnector(connector:PayrollConnector){connectors.set(connector.id,connector);}
export function payrollConnector(id:string){const connector=connectors.get(id);if(!connector)throw new AppError(503,"payroll_not_connected","This employer has no authorized payroll connection yet. Request Form 16 from your payroll/DDO team or use salary records.");return connector;}
