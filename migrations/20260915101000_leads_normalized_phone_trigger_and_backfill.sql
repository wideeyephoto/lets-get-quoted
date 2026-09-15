CREATE OR REPLACE FUNCTION public.normalize_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.normalized_phone = regexp_replace(NEW.phone, '\D', '', 'g');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_normalize_phone
BEFORE INSERT OR UPDATE OF phone ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.normalize_phone();

UPDATE public.leads SET normalized_phone = regexp_replace(phone, '\D', '', 'g') WHERE normalized_phone IS NULL AND phone IS NOT NULL;
