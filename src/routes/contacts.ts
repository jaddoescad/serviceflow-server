import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, NotFoundError } from '../lib/errors';
import * as ContactRepository from '../repositories/contact-repository';
import * as RpcRepository from '../repositories/rpc-repository';
import { requireCompanyAccess, requireResourceAccess } from '../middleware/authorization';
import { parsePaginationParams } from '../lib/pagination';

const router = Router();

// Get contacts (optionally filtered by company_id) - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id } = req.query;
    const contacts = await ContactRepository.getContacts({
      company_id: company_id as string,
    });
    res.json(contacts);
  })
);

// Get contacts with server-side pagination
router.get(
  '/paginated',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, showArchived } = req.query;

    if (!company_id) {
      throw new ValidationError('company_id is required');
    }

    const pagination = parsePaginationParams(req.query as Record<string, string>);

    const filters: ContactRepository.ContactListFilters = {
      company_id: company_id as string,
      showArchived: showArchived === 'true' || showArchived === '1',
    };

    const [paginatedContacts, summary] = await Promise.all([
      ContactRepository.getContactsPaginated(filters, pagination),
      ContactRepository.getContactListSummary(company_id as string),
    ]);

    res.json({
      ...paginatedContacts,
      summary,
    });
  })
);

// Create contact with addresses atomically - requires company membership
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, first_name, last_name, email, phone, addresses } = req.body;

    if (!company_id || !first_name) {
      throw new ValidationError('company_id and first_name are required');
    }

    // Create contact and addresses atomically using RPC
    // If address creation fails, the entire transaction is rolled back
    const result = await RpcRepository.createContactWithAddresses({
      companyId: company_id,
      firstName: first_name,
      lastName: last_name,
      email,
      phone,
      addresses: addresses || [],
    });

    // Return in the expected format (ContactWithAddresses)
    res.json({
      ...result.contact,
      addresses: result.addresses,
    });
  })
);

// Get contact by ID - requires access to contact's company
router.get(
  '/:id',
  requireResourceAccess({ resourceType: 'contact' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const contact = await ContactRepository.getContactById(id);

    if (!contact) {
      throw new NotFoundError('Contact not found');
    }

    res.json(contact);
  })
);

// Update contact and optionally add/update addresses atomically - requires access to contact's company
router.patch(
  '/:id',
  requireResourceAccess({ resourceType: 'contact' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, email, phone, addresses } = req.body ?? {};

    // Update contact and addresses atomically using RPC
    // If any operation fails, the entire transaction is rolled back
    const result = await RpcRepository.updateContactWithAddresses({
      contactId: id,
      firstName: first_name,
      lastName: last_name,
      email,
      phone,
      addresses: addresses && Array.isArray(addresses) && addresses.length > 0 ? addresses : null,
    });

    // Return in the expected format (ContactWithAddresses)
    res.json({
      ...result.contact,
      addresses: result.addresses,
    });
  })
);

// Add addresses to a contact atomically - requires access to contact's company
router.post(
  '/:id/addresses',
  requireResourceAccess({ resourceType: 'contact' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { addresses } = req.body ?? {};

    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new ValidationError('addresses array is required');
    }

    // Add all addresses atomically using RPC
    // If any address creation fails, all are rolled back
    const result = await RpcRepository.addAddressesToContact({
      contactId: id,
      addresses,
    });

    res.json(result.addresses);
  })
);

export default router;
