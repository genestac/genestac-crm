DELETE FROM role_permissions;
DELETE FROM permissions;

INSERT INTO permissions (action, module, description) VALUES
('create', 'Patients', 'Create new patients'),
('read', 'Patients', 'View patients'),
('update', 'Patients', 'Update patients'),
('delete', 'Patients', 'Delete patients'),

('create', 'Inventory', 'Create new inventory'),
('read', 'Inventory', 'View inventory'),
('update', 'Inventory', 'Update inventory'),
('delete', 'Inventory', 'Delete inventory'),

('create', 'Logistics', 'Create logistics records'),
('read', 'Logistics', 'View logistics'),
('update', 'Logistics', 'Update logistics'),
('delete', 'Logistics', 'Delete logistics'),

('create', 'Analytics', 'Create analytics reports'),
('read', 'Analytics', 'View analytics'),
('update', 'Analytics', 'Update analytics reports'),
('delete', 'Analytics', 'Delete analytics reports');
