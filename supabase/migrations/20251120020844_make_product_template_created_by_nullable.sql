-- Allow product templates to be created without a creator (client does not supply a user id yet)
ALTER TABLE product_templates
  ALTER COLUMN created_by_user_id DROP NOT NULL;
