-- Add full_name column to users table
ALTER TABLE public.users ADD COLUMN full_name TEXT;

-- Update handle_new_user trigger to copy full_name from auth metadata
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

  -- Create user row first (organizations.owner_id references users.id)
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
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

  -- Set active_org_id on the user
  UPDATE public.users SET active_org_id = new_org_id WHERE id = new_user_id;

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
