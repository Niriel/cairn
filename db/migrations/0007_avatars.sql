-- 0007_avatars.sql — avatar_version column + three RPCs +
-- trigger rebind for profiles.

-- R1: avatar_version column
ALTER TABLE public.profiles
ADD COLUMN avatar_version int NOT NULL DEFAULT 0
CHECK (avatar_version >= 0);

-- R2: bump_avatar_version
CREATE OR REPLACE FUNCTION public.bump_avatar_version()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
     SET avatar_version = avatar_version + 1
   WHERE id = public.uid()
  RETURNING avatar_version;
$$;

REVOKE ALL ON FUNCTION public.bump_avatar_version() FROM public;
GRANT EXECUTE ON FUNCTION public.bump_avatar_version() TO authenticated;

-- R3: clear_avatar
CREATE OR REPLACE FUNCTION public.clear_avatar()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
     SET avatar_version = 0
   WHERE id = public.uid();
$$;

REVOKE ALL ON FUNCTION public.clear_avatar() FROM public;
GRANT EXECUTE ON FUNCTION public.clear_avatar() TO authenticated;

-- R4: set_display_name
CREATE OR REPLACE FUNCTION public.set_display_name(new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trimmed text := trim(new_name);
BEGIN
  IF public.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF trimmed = '' OR length(trimmed) > 100 THEN
    RAISE EXCEPTION 'display name must be 1–100 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.profiles
     SET display_name = trimmed
   WHERE id = public.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.set_display_name(text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_display_name(text) TO authenticated;

-- R5: trigger rebind — add avatar_version to the OF clause.
-- ALTER TRIGGER cannot change the OF column list, so DROP + CREATE.
DROP TRIGGER t20_set_modified_at ON public.profiles;

CREATE TRIGGER t20_set_modified_at
BEFORE UPDATE OF display_name, avatar_version ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_modified_at();
