-- Ensure a private storage bucket exists for proposal attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-attachments', 'proposal-attachments', FALSE)
ON CONFLICT (id) DO NOTHING;
