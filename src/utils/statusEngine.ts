import { Requirement, RequirementStatus, RequirementState } from '../types';

/**
 * Calculates the exact status for a requirement.
 * Statuses:
 * - Missing: mandatory requirement + no file [BLOCKING]
 * - Expiry date needed: has_expiry=true + matched file + no expiry [BLOCKING]
 * - Expired: expiry before submission deadline [BLOCKING]
 * - Not provided: optional requirement + no file [NON-BLOCKING]
 * - OK: matched file + valid expiry if required (or has_expiry=false) [NON-BLOCKING]
 */
export function calculateRequirementStatus(
  requirement: Requirement,
  matchedFileId: string | null,
  expiryDate: string,
  submissionDeadline: string
): { status: RequirementStatus; isBlocking: boolean; reason: string } {
  // Check if a file is matched
  const hasFile = Boolean(matchedFileId);

  // Case 1 & 4: No file matched
  if (!hasFile) {
    if (requirement.mandatory) {
      return {
        status: 'Missing',
        isBlocking: true,
        reason: 'Mandatory document has not been uploaded or assigned.',
      };
    } else {
      return {
        status: 'Not provided',
        isBlocking: false,
        reason: 'Optional document not provided.',
      };
    }
  }

  // File is matched. Check expiry requirement.
  if (requirement.has_expiry) {
    const cleanExpiry = expiryDate ? expiryDate.trim() : '';
    if (!cleanExpiry) {
      return {
        status: 'Expiry date needed',
        isBlocking: true,
        reason: 'This document requires an expiry date to be specified.',
      };
    }

    // Calendar-date comparison (YYYY-MM-DD format string comparison)
    // Ensures no timezone conversion or off-by-one errors
    const cleanDeadline = submissionDeadline ? submissionDeadline.trim() : '';
    if (cleanDeadline && cleanExpiry < cleanDeadline) {
      return {
        status: 'Expired',
        isBlocking: true,
        reason: `Document expired on ${cleanExpiry}, which is before the submission deadline (${cleanDeadline}).`,
      };
    }
  }

  // All checks passed
  return {
    status: 'OK',
    isBlocking: false,
    reason: 'Requirement satisfied.',
  };
}

/**
 * Recalculate status for all requirements given current matches, expiry dates, and tender deadline.
 */
export function computeAllRequirementStates(
  requirements: Requirement[],
  matches: Record<string, string | null>, // requirementId -> fileId
  expiryDates: Record<string, string>, // requirementId -> YYYY-MM-DD
  submissionDeadline: string
): RequirementState[] {
  // Sort requirements by order ascending
  const sorted = [...requirements].sort((a, b) => a.order - b.order);

  return sorted.map((req) => {
    const matchedFileId = matches[req.id] || null;
    const expiry = expiryDates[req.id] || '';
    const { status, isBlocking, reason } = calculateRequirementStatus(
      req,
      matchedFileId,
      expiry,
      submissionDeadline
    );

    return {
      requirement: req,
      matchedFileId,
      expiryDate: expiry,
      status,
      isBlocking,
      statusReason: reason,
    };
  });
}
