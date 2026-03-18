-- Migration: Add trial_ends_at column and update signup trigger
-- Issue: DOC-37 (BIL-3)

-- 1. Add trial_ends_at column
-- Existing users get NULL (no trial), which is correct — they're
-- either design partners or need to subscribe.
ALTER TABLE users ADD COLUMN trial_ends_at TIMESTAMPTZ;

-- 2. Replace handle_new_user() to set trial_ends_at on signup
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

  -- Create user row with 14-day trial
  INSERT INTO public.users (id, email, trial_ends_at)
  VALUES (NEW.id, NEW.email, now() + interval '14 days')
  RETURNING id INTO new_user_id;

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
    RAISE WARNING 'handle_new_user trigger failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
