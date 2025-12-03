# Clean API Architecture Guide

This document explains the architectural patterns used in this Express/TypeScript API.

## 🏗️ Architecture Layers

Our API follows a clean, layered architecture:

```
┌─────────────────────────────────────────┐
│         1. ROUTES (Controllers)         │  ← HTTP layer
│  • Handle requests/responses            │
│  • Validate input                       │
│  • Call services or repositories        │
│  • Return JSON responses                │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│           2. SERVICES                   │  ← Business logic layer
│  • Business rules & validation          │
│  • Orchestrate multiple repositories    │
│  • Handle complex multi-step operations │
│  • Send notifications                   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         3. REPOSITORIES                 │  ← Data access layer
│  • Database queries (CRUD)              │
│  • Single source of truth for DB access │
│  • Type-safe Supabase operations        │
│  • NO business logic                    │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│        4. DATABASE (Supabase)           │
└─────────────────────────────────────────┘
```

## 📋 Layer Responsibilities

### 1. Routes (`src/routes/`)

**Purpose**: Handle HTTP requests and responses

**Responsibilities**:
- Parse query parameters and request body
- Validate required fields
- Call services or repositories
- Return HTTP responses (200, 400, 404, 500)
- Handle errors with `respondWithError`

**Rules**:
- ❌ NO direct Supabase calls
- ❌ NO complex business logic
- ✅ Keep route handlers thin
- ✅ Use try-catch for error handling

**Example**:
```typescript
// routes/crews.ts
import * as CrewRepository from '../repositories/crew-repository';

router.get('/', async (req, res) => {
  try {
    const { company_id } = req.query;
    const crews = await CrewRepository.getCrews({ company_id });
    res.json(crews);
  } catch (error) {
    return respondWithError(res, error);
  }
});
```

### 2. Services (`src/services/`)

**Purpose**: Implement business logic and orchestrate operations

**Responsibilities**:
- Multi-step operations (e.g., accept quote → create invoice → send notification)
- Business rules and calculations
- Coordinate multiple repositories
- Send emails/SMS notifications
- Complex validation logic

**Rules**:
- ❌ NO direct Supabase calls (use repositories)
- ❌ NO HTTP response handling
- ✅ Throw errors for routes to catch
- ✅ Return typed data
- ✅ Keep services testable

**Example**:
```typescript
// services/change-order-service.ts
import * as ChangeOrderRepository from '../repositories/change-order-repository';
import * as InvoiceRepository from '../repositories/invoice-repository';

export async function acceptChangeOrder(params: {
  changeOrderId: string;
  invoiceId: string;
  signerName?: string;
}): Promise<ChangeOrderAcceptanceResult> {
  // 1. Fetch change order
  const changeOrder = await ChangeOrderRepository.getChangeOrderById(params.changeOrderId);

  if (!changeOrder) {
    throw new Error('Change order not found');
  }

  if (changeOrder.status === 'accepted') {
    throw new Error('Change order already accepted');
  }

  // 2. Calculate totals
  const delta = calculateChangeOrderTotal(changeOrder.items);

  // 3. Add items to invoice
  await InvoiceRepository.createInvoiceLineItems(invoiceLineItems);

  // 4. Update invoice totals
  await InvoiceRepository.updateInvoice(params.invoiceId, {
    total_amount: newTotal,
    balance_due: newBalance,
  });

  // 5. Update change order
  const updated = await ChangeOrderRepository.updateChangeOrder(params.changeOrderId, {
    status: 'accepted',
    accepted_at: new Date().toISOString(),
  });

  return { updatedChangeOrder: updated, delta };
}
```

### 3. Repositories (`src/repositories/`)

**Purpose**: Provide typed, reusable database access

**Responsibilities**:
- CRUD operations (Create, Read, Update, Delete)
- Database queries using Supabase client
- Type-safe data access
- Custom error handling with `DatabaseError`

**Rules**:
- ✅ ONLY place for Supabase calls
- ✅ One repository per database table/entity
- ✅ Export typed functions
- ✅ Use custom `DatabaseError` class
- ❌ NO business logic
- ❌ NO email/SMS sending
- ❌ NO complex calculations

**Example**:
```typescript
// repositories/crew-repository.ts
import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

export type Crew = {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export async function getCrews(filters?: {
  company_id?: string;
}): Promise<Crew[]> {
  let query = supabase.from('crews').select('*');

  if (filters?.company_id) {
    query = query.eq('company_id', filters.company_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError('Failed to fetch crews', error);
  }

  return data ?? [];
}

export async function createCrew(crewData: Partial<Crew>): Promise<Crew> {
  const { data, error } = await supabase
    .from('crews')
    .insert([crewData])
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to create crew', error);
  }

  return data;
}
```

## 🎯 Decision Tree: When to Use What

### Should I create a Service?

```
Does the operation involve:
├─ Just reading data?                    → Route → Repository
├─ Simple create/update (one table)?     → Route → Repository
├─ Multiple database tables?             → Route → Service → Repositories
├─ Business calculations/rules?          → Route → Service → Repository
├─ Sending notifications?                → Route → Service → Repository
├─ Complex multi-step workflow?          → Route → Service → Repositories
└─ Quote/invoice acceptance?             → Route → Service → Repositories
```

### Examples by Complexity

**Simple** (No Service Needed):
- GET /crews → List crews
- POST /crews → Create crew
- GET /contacts → List contacts
- PATCH /deals/:id → Update deal fields

**Complex** (Service Needed):
- POST /quotes/:id/accept → Quote acceptance (creates invoice, updates deal, sends emails)
- POST /change-orders/:id/accept → Change order acceptance (updates invoice, calculates totals)
- POST /work-orders → Create work order (sends SMS/email to crew)

## 📁 File Structure

```
src/
├── routes/                      # HTTP endpoints
│   ├── deals/                   # Modular deal routes
│   │   ├── index.ts            # Deal CRUD
│   │   ├── quotes.ts           # Deal quotes
│   │   ├── invoices.ts         # Deal invoices
│   │   └── appointment-scheduling.ts
│   ├── quotes/
│   │   ├── index.ts            # Quote CRUD
│   │   └── public-sharing.ts   # Public quote acceptance
│   ├── contacts.ts
│   ├── crews.ts
│   └── invoices.ts
│
├── services/                    # Business logic
│   ├── quote-service.ts
│   ├── change-order-service.ts
│   └── communication-service.ts
│
├── repositories/                # Data access layer
│   ├── quote-repository.ts
│   ├── deal-repository.ts
│   ├── invoice-repository.ts
│   ├── contact-repository.ts
│   ├── appointment-repository.ts
│   ├── crew-repository.ts
│   ├── deal-note-repository.ts
│   ├── change-order-repository.ts
│   └── company-member-repository.ts
│
├── lib/                         # Utilities
│   ├── supabase.ts             # Supabase client
│   ├── error-response.ts       # Error handling
│   └── owner-notifications.ts
│
└── utils/                       # Helper functions
    ├── formatting.ts
    └── validation.ts
```

## 🚀 How to Add a New Feature

### Example: Add "Archive Deal" Feature

#### Step 1: Add Repository Function (if needed)

```typescript
// repositories/deal-repository.ts

export async function archiveDeal(dealId: string): Promise<Deal> {
  const { data, error } = await supabase
    .from('deals')
    .update({
      archived: true,
      archived_at: new Date().toISOString()
    })
    .eq('id', dealId)
    .select()
    .single();

  if (error) {
    throw new DatabaseError('Failed to archive deal', error);
  }

  return data;
}
```

#### Step 2: Add Service (if complex business logic needed)

```typescript
// services/deal-service.ts

import * as DealRepository from '../repositories/deal-repository';
import * as AppointmentRepository from '../repositories/appointment-repository';
import { sendEmail } from './communication-service';

export async function archiveDeal(dealId: string): Promise<void> {
  // 1. Get deal
  const deal = await DealRepository.getDealById(dealId);
  if (!deal) {
    throw new Error('Deal not found');
  }

  // 2. Cancel future appointments
  const appointments = await AppointmentRepository.getAppointmentsByDealId(dealId);
  for (const apt of appointments) {
    if (new Date(apt.scheduled_start) > new Date()) {
      await AppointmentRepository.deleteAppointment(apt.id);
    }
  }

  // 3. Archive the deal
  await DealRepository.archiveDeal(dealId);

  // 4. Notify team
  await sendEmail({
    companyId: deal.company_id,
    to: deal.salesperson_email,
    subject: `Deal ${deal.id} Archived`,
    body: `Deal for ${deal.first_name} ${deal.last_name} has been archived.`
  });
}
```

#### Step 3: Add Route

```typescript
// routes/deals/index.ts

router.post('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;

    // Call service for complex operation
    await DealService.archiveDeal(id);

    res.json({ success: true, message: 'Deal archived' });
  } catch (error) {
    return respondWithError(res, error);
  }
});
```

## ✅ Best Practices

### 1. Error Handling

**Always use try-catch in routes**:
```typescript
router.get('/', async (req, res) => {
  try {
    const data = await Repository.getData();
    res.json(data);
  } catch (error) {
    return respondWithError(res, error);
  }
});
```

**Throw descriptive errors in services**:
```typescript
if (!quote) {
  throw new Error('Quote not found');
}

if (quote.status === 'accepted') {
  throw new Error('Quote already accepted');
}
```

**Use DatabaseError in repositories**:
```typescript
if (error) {
  throw new DatabaseError('Failed to fetch quotes', error);
}
```

### 2. Type Safety

**Define types for repositories**:
```typescript
export type Contact = {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  created_at: string;
  updated_at: string;
};
```

**Use Partial<> for updates**:
```typescript
export async function updateContact(
  contactId: string,
  updates: Partial<Contact>
): Promise<Contact> {
  // ...
}
```

### 3. Validation

**Validate in routes**:
```typescript
if (!company_id || !name) {
  return res.status(400).json({
    error: 'company_id and name are required'
  });
}
```

**Validate business rules in services**:
```typescript
if (changeOrder.items.length === 0) {
  throw new Error('Add at least one item before accepting');
}
```

### 4. Reusability

**Don't repeat database queries**:
```typescript
// ❌ Bad: Same query in multiple routes
router.get('/route1', async () => {
  const { data } = await supabase.from('crews').select('*');
});

router.get('/route2', async () => {
  const { data } = await supabase.from('crews').select('*');
});

// ✅ Good: One repository function used everywhere
export async function getCrews() {
  const { data, error } = await supabase.from('crews').select('*');
  if (error) throw new DatabaseError('Failed to fetch crews', error);
  return data ?? [];
}
```

## 🧪 Testing Strategy

### Repository Tests
- Mock Supabase client
- Test CRUD operations
- Test error handling

### Service Tests
- Mock repositories
- Test business logic
- Test multi-step workflows

### Route Tests (Integration)
- Test full request/response
- Test error cases
- Test validation

## 📚 Additional Resources

- [Repository Pattern Explained](https://martinfowler.com/eaaCatalog/repository.html)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Supabase JS Client Docs](https://supabase.com/docs/reference/javascript/introduction)

## 🔄 Migration Status

Currently migrated to repository pattern:
- ✅ contacts.ts
- ✅ deal-notes.ts
- ✅ crews.ts
- ✅ company-members.ts
- ✅ deals/index.ts

Services created:
- ✅ quote-service.ts
- ✅ change-order-service.ts
- ✅ communication-service.ts

Repositories created:
- ✅ QuoteRepository
- ✅ DealRepository
- ✅ InvoiceRepository
- ✅ ContactRepository
- ✅ AppointmentRepository
- ✅ CrewRepository
- ✅ DealNoteRepository
- ✅ ChangeOrderRepository
- ✅ CompanyMemberRepository
- ✅ CompanyRepository

---

**Questions?** Review existing repositories and services for examples, or check this guide for patterns.
