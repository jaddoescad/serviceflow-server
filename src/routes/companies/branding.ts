import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import multer from 'multer';
import * as CompanyService from '../../services/company-service';
import { requireCompanyAccess } from '../../middleware/authorization';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// Update company branding - requires membership
router.post(
  '/:id/branding',
  requireCompanyAccess({ companyIdParam: 'id' }),
  upload.single('logo'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { websiteUrl, reviewUrl, removeLogo } = req.body;
    const file = req.file;

    const result = await CompanyService.updateCompanyBranding({
      companyId: id,
      websiteUrl: websiteUrl || null,
      reviewUrl: reviewUrl || null,
      removeLogo: removeLogo === 'true',
      logoFile: file
        ? {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
          }
        : undefined,
    });

    res.json(result);
  })
);

// Get company logo - requires membership
router.post(
  '/:id/branding/logo',
  requireCompanyAccess({ companyIdParam: 'id' }),
  asyncHandler(async (req, res) => {
    const { storageKey } = req.body;

    const signedUrl = await CompanyService.getCompanyLogoSignedUrl(storageKey);
    res.json({ signedUrl });
  })
);

export default router;
