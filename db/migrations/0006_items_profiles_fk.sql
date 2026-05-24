-- 0006_items_profiles_fk.sql — FK constraints enabling PostgREST profile joins
--   from items.created_by, items.modified_by, and votes.user_id to public.profiles.
--   Mirrors the list_members → profiles FK added in 0005.
ALTER TABLE public.items
ADD CONSTRAINT items_created_by_profiles_fk
FOREIGN KEY (created_by) REFERENCES public.profiles (id) ON DELETE SET DEFAULT,
ADD CONSTRAINT items_modified_by_profiles_fk
FOREIGN KEY (modified_by) REFERENCES public.profiles (id) ON DELETE SET DEFAULT;

ALTER TABLE public.votes
ADD CONSTRAINT votes_user_id_profiles_fk
FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
