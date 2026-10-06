export interface TenderInfo {
  tender_id: string;
  title: string;
  procuring_entity: string;
  bidder: string;
  submission_deadline: string; // YYYY-MM-DD
}

export interface Requirement {
  id: string;
  order: number;
  title_en: string;
  title_bn: string;
  mandatory: boolean;
  has_expiry: boolean;
}

export interface RequirementsConfig {
  tender: TenderInfo;
  requirements: Requirement[];
}

export type RequirementStatus = 
  | 'Missing'
  | 'Expiry date needed'
  | 'Expired'
  | 'Not provided'
  | 'OK';

export interface UploadedPdfFile {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  sha256: string;
  isDuplicate: boolean;
  matchedRequirementId: string | null;
  error?: string;
  arrayBuffer: ArrayBuffer;
}

export interface RequirementState {
  requirement: Requirement;
  matchedFileId: string | null;
  expiryDate: string; // YYYY-MM-DD
  status: RequirementStatus;
  isBlocking: boolean;
  statusReason?: string;
}

export type Language = 'en' | 'bn';
