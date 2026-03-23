-- Migration: Update handle_new_user trigger to set is_design_partner from invite code metadata
-- When a user signs up with an invite code (passed via raw_user_meta_data),
-- the trigger sets is_design_partner = true on the new user row.
-- The invite code is validated server-side before signup, so the trigger
-- only needs to check for presence of the metadata field.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_user_id UUID;
  new_org_id UUID;
  org_name TEXT;
  email_domain TEXT;
BEGIN
  -- Extract domain from email for default org name
  email_domain := split_part(NEW.email, '@', 2);
  IF email_domain IS NOT NULL AND email_domain != '' THEN
    org_name := initcap(split_part(email_domain, '.', 1));
  ELSE
    org_name := 'My Organization';
  END IF;

  -- Create user row
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  RETURNING id INTO new_user_id;

  -- Set design partner flag if invite code was provided
  IF NEW.raw_user_meta_data->>'invite_code' IS NOT NULL
     AND NEW.raw_user_meta_data->>'invite_code' != '' THEN
    UPDATE public.users SET is_design_partner = true WHERE id = new_user_id;
  END IF;

  -- Create default organization
  INSERT INTO public.organizations (name, owner_id)
  VALUES (org_name, new_user_id)
  RETURNING id INTO new_org_id;

  -- Create org membership
  INSERT INTO public.org_memberships (user_id, org_id, role)
  VALUES (new_user_id, new_org_id, 'owner');

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block auth signup
    RAISE WARNING 'handle_new_user trigger failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
