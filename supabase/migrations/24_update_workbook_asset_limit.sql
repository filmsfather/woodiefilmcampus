-- Increase workbook asset bucket file size limit to 20MB
begin;

update storage.buckets
set file_size_limit = 20 * 1024 * 1024
where id = 'workbook-assets';

commit;
