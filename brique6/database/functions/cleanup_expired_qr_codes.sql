-- database/functions/cleanup_expired_qr_codes.sql
CREATE OR REPLACE FUNCTION cleanup_expired_qr_codes()
RETURNS void AS $$
BEGIN
    UPDATE molam_qr_codes 
    SET status = 'expired' 
    WHERE expires_at < NOW() 
    AND status = 'active';
END;
$$ LANGUAGE plpgsql;