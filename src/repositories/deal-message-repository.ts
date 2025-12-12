import { supabase } from '../lib/supabase';
import { DatabaseError } from './quote-repository';

export type DealMessageDirection = 'inbound' | 'outbound';

export type DealMessage = {
  id: string;
  company_id: string;
  deal_id: string;
  direction: DealMessageDirection;
  body: string | null;
  author_user_id: string | null;
  from_number: string | null;
  to_number: string | null;
  provider: string | null;
  provider_message_id: string | null;
  image_storage_key: string | null;
  image_original_filename: string | null;
  image_content_type: string | null;
  image_byte_size: number | null;
  created_at: string;
  updated_at: string;
  author?: { display_name: string | null; email: string | null } | null;
  [key: string]: any;
};

export async function getDealMessagesByDealId(dealId: string): Promise<DealMessage[]> {
  const { data, error } = await supabase
    .from('deal_messages')
    .select('*,author:users(display_name,email)')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new DatabaseError('Failed to fetch deal messages', error);
  }

  return (data as unknown as DealMessage[]) ?? [];
}

export async function createDealMessage(messageData: Partial<DealMessage>): Promise<DealMessage> {
  const { data, error } = await supabase
    .from('deal_messages')
    .insert([messageData])
    .select('*,author:users(display_name,email)')
    .single();

  if (error) {
    throw new DatabaseError('Failed to create deal message', error);
  }

  return data as unknown as DealMessage;
}

export async function findLatestDealIdByNumbers(params: {
  companyId: string;
  fromNumber: string;
  toNumber: string;
}): Promise<string | null> {
  const { companyId, fromNumber, toNumber } = params;

  const { data, error } = await supabase
    .from('deal_messages')
    .select('deal_id')
    .eq('company_id', companyId)
    .eq('from_number', fromNumber)
    .eq('to_number', toNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to find latest deal message thread', error);
  }

  return (data as any)?.deal_id ?? null;
}

export async function existsDealMessageByProviderId(params: {
  provider: string;
  providerMessageId: string;
}): Promise<boolean> {
  const { provider, providerMessageId } = params;

  if (!provider || !providerMessageId) {
    return false;
  }

  const { data, error } = await supabase
    .from('deal_messages')
    .select('id')
    .eq('provider', provider)
    .eq('provider_message_id', providerMessageId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Failed to check deal message provider ID', error);
  }

  return Boolean((data as any)?.id);
}
