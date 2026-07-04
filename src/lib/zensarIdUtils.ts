/**
 * Zensar ID Utilities
 * Handles formatting and validation of Zensar employee IDs (EXACTLY 5 or 6 digits only)
 */

/**
 * Formats a Zensar ID (must be exactly 5 or 6 digits)
 * @param id - The input ID (string or number)
 * @returns Formatted Zensar ID (5 or 6 digits only) or '—' if invalid
 */
export const formatZensarId = (id: string | number | null | undefined): string => {
  if (!id) return '—';
  
  const cleanId = id.toString().replace(/[^0-9]/g, '');
  
  // Must be exactly 5 or 6 digits - no padding, no truncation
  if (cleanId.length === 5 || cleanId.length === 6) {
    return cleanId;
  }
  
  // Invalid if not exactly 5 or 6 digits
  return '—';
};

/**
 * Validates if a Zensar ID is exactly 5 or 6 digits
 * @param id - The input ID
 * @returns true if exactly 5 or 6 digits
 */
export const isValidZensarId = (id: string | number | null | undefined): boolean => {
  if (!id) return false;
  const cleanId = id.toString().replace(/[^0-9]/g, '');
  return cleanId.length === 5 || cleanId.length === 6;
};

/**
 * Extracts Zensar ID from various employee object formats
 * @param employee - Employee object with various ID field names
 * @returns Formatted Zensar ID
 */
export const extractZensarId = (employee: any): string => {
  // Prefer the dedicated Zensar ID fields over the internal primary key `id`.
  // For auto-imported employees the real Zensar ID lives in `zensar_id` while `id`
  // stays as the internal sequential key — so `zensar_id` must win for display.
  const possibleIds = [
    employee?.ZensarID,
    employee?.zensar_id,
    employee?.zensarId,
    employee?.id,
    employee?.ID,
    employee?.employee_id,
    employee?.employeeId
  ];
  
  for (const id of possibleIds) {
    if (id && isValidZensarId(id)) {
      return formatZensarId(id);
    }
  }
  
  return '—';
};

/**
 * Validates and formats employee ID with strict rules
 * @param id - The input ID
 * @returns Object with validation result and formatted ID
 */
export const validateAndFormatZensarId = (id: string | number | null | undefined): {
  isValid: boolean;
  formattedId: string;
  error?: string;
} => {
  if (!id) {
    return { isValid: false, formattedId: '—', error: 'ID is required' };
  }
  
  const cleanId = id.toString().replace(/[^0-9]/g, '');
  
  if (cleanId.length === 0) {
    return { isValid: false, formattedId: '—', error: 'ID must contain digits' };
  }
  
  if (cleanId.length < 5) {
    return { isValid: false, formattedId: '—', error: `ID too short: ${cleanId.length} digits (need 5 or 6)` };
  }
  
  if (cleanId.length > 6) {
    return { isValid: false, formattedId: '—', error: `ID too long: ${cleanId.length} digits (need 5 or 6)` };
  }
  
  // Valid: exactly 5 or 6 digits
  return { isValid: true, formattedId: cleanId };
};

/**
 * Creates a display string for employee with formatted ID
 * @param employee - Employee object
 * @returns "Name (123456)" format
 */
export const formatEmployeeDisplay = (employee: any): string => {
  const name = employee?.name || employee?.Name || employee?.employee_name || 'Unknown';
  const id = extractZensarId(employee);
  return `${name} (${id})`;
};