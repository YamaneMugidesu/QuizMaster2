-- Update handle_new_user trigger to include new profile fields
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (
    id, 
    username, 
    role, 
    created_at,
    is_active,
    is_deleted,
    provider_name,
    school_stage,
    subject
  )
  values (
    new.id, 
    new.raw_user_meta_data->>'username', 
    'USER', 
    extract(epoch from now()) * 1000,
    true,
    false,
    new.raw_user_meta_data->>'provider_name',
    -- Parse JSON arrays to text arrays safely
    coalesce(
      (
        select array_agg(x) 
        from jsonb_array_elements_text(
          case 
            when jsonb_typeof(new.raw_user_meta_data->'school_stage') = 'array' 
            then new.raw_user_meta_data->'school_stage' 
            else '[]'::jsonb 
          end
        ) as t(x)
      ), 
      '{}'::text[]
    ),
    coalesce(
      (
        select array_agg(x) 
        from jsonb_array_elements_text(
          case 
            when jsonb_typeof(new.raw_user_meta_data->'subject') = 'array' 
            then new.raw_user_meta_data->'subject' 
            else '[]'::jsonb 
          end
        ) as t(x)
      ), 
      '{}'::text[]
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
