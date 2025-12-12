import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authenticateRequest } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import companiesRouter from './routes/companies/index';
import companyEmailSettingsRouter from './routes/companies/email-settings';
import companyTwilioRouter from './routes/companies/twilio';
import companyBrandingRouter from './routes/companies/branding';
import contactsRouter from './routes/contacts';
import dealsRouter from './routes/deals';
import dealAppointmentSchedulingRouter from './routes/deals/appointment-scheduling';
import dealQuotesRouter from './routes/deals/quotes';
import dealInvoicesRouter from './routes/deals/invoices';
import dealMessagesRouter from './routes/deals/messages';
import appointmentsCalendarRouter from './routes/appointments-calendar';
import invoicesRouter from './routes/invoices';
import crewsRouter from './routes/crews';
import usersRouter from './routes/users';
import dealNotesRouter from './routes/deal-notes';
import productTemplatesRouter from './routes/product-templates';
import quotesRouter from './routes/quotes/index';
import quotePublicSharingRouter from './routes/quotes/public-sharing';
import communicationTemplatesRouter from './routes/communication-templates';
import dripSequencesRouter from './routes/drip-sequences';
import dripStepsRouter from './routes/drip-steps';
import companyMembersRouter from './routes/company-members';
import proposalAttachmentsRouter from './routes/proposal-attachments';
import integrationsRouter from './routes/integrations';
import googleCalendarRouter from './routes/google-calendar';
import googlePlacesRouter from './routes/google-places';
import changeOrdersRouter from './routes/change-orders';
import workOrdersRouter from './routes/work-orders';
import companyDealSourcesRouter from './routes/company-deal-sources';
import dashboardRouter from './routes/dashboard';
import pipelinesRouter from './routes/pipelines';
import twilioWebhooksRouter from './routes/webhooks/twilio';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check (public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Public Routes (no authentication required)
app.use('/quotes', quotePublicSharingRouter);
app.use('/google-places', googlePlacesRouter);
app.use('/webhooks/twilio', twilioWebhooksRouter);

// Protected API Routes (authentication required)
app.use('/companies', authenticateRequest, companiesRouter);
app.use('/companies', authenticateRequest, companyEmailSettingsRouter);
app.use('/companies', authenticateRequest, companyTwilioRouter);
app.use('/companies', authenticateRequest, companyBrandingRouter);
app.use('/companies', authenticateRequest, companyDealSourcesRouter);
app.use('/contacts', authenticateRequest, contactsRouter);
app.use('/deals', authenticateRequest, dealsRouter);
app.use('/deals', authenticateRequest, dealAppointmentSchedulingRouter);
app.use('/deals', authenticateRequest, dealQuotesRouter);
app.use('/deals', authenticateRequest, dealInvoicesRouter);
app.use('/deals', authenticateRequest, dealMessagesRouter);
app.use('/appointments', authenticateRequest, appointmentsCalendarRouter);
app.use('/invoices', authenticateRequest, invoicesRouter);
app.use('/crews', authenticateRequest, crewsRouter);
app.use('/users', authenticateRequest, usersRouter);
app.use('/deal-notes', authenticateRequest, dealNotesRouter);
app.use('/product-templates', authenticateRequest, productTemplatesRouter);
app.use('/quotes', authenticateRequest, quotesRouter);
app.use('/communication-templates', authenticateRequest, communicationTemplatesRouter);
app.use('/drip-sequences', authenticateRequest, dripSequencesRouter);
app.use('/drip-steps', authenticateRequest, dripStepsRouter);
app.use('/company-members', authenticateRequest, companyMembersRouter);
app.use('/proposal-attachments', authenticateRequest, proposalAttachmentsRouter);
app.use('/integrations', authenticateRequest, integrationsRouter);
app.use('/google-calendar', authenticateRequest, googleCalendarRouter);
app.use('/change-orders', authenticateRequest, changeOrdersRouter);
app.use('/work-orders', authenticateRequest, workOrdersRouter);
app.use('/dashboard', authenticateRequest, dashboardRouter);
app.use('/pipelines', authenticateRequest, pipelinesRouter);

// Error Handling (must be after all routes)
app.use(notFoundHandler);
app.use(errorHandler);

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
