-- POSTGRES_DB creates email_test on first boot. The second one has to be made here.
-- Two databases in one cluster cannot query each other, so architecture rule 2 is
-- intact without a second container.
CREATE DATABASE users_test OWNER test_svc;