INSERT INTO molam_users (id, user_type) 
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 
  'particular'
) ON CONFLICT (id) DO NOTHING;

SELECT '✅ User test prêt' as status;