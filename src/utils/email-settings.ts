/**
 * Email Settings Utility
 * Re-exports email settings functionality from the repository
 *
 * This file exists for backward compatibility and convenience.
 * All database access is handled by the repository layer.
 */

export {
  getCompanyEmailSettings,
  type CompanyEmailSettings,
} from '../repositories/company-email-settings-repository';
